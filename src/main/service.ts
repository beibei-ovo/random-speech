import { randomUUID } from "node:crypto";
import { openSync, writeSync, closeSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { Store } from "./store";
import { TrainingClock } from "./timer";
import { Provider, type ProviderConfig } from "./provider";
import topics from "../../resources/topics.json";
import type { Attempt, Revision, Snapshot } from "../shared/types";
export class TrainingService {
  clock = new TrainingClock();
  recording: {
    id: string;
    fd: number;
    seq: number;
    start: number | null;
    stopSent: boolean;
    bytes: number;
  } | null = null;
  tasks = new Map<
    string,
    { controller: AbortController; promise: Promise<void> }
  >();
  onChange = (_snapshot: Snapshot) => {};
  onStop = (_id: string) => {};
  lastSave = 0;
  constructor(
    public store: Store,
    private config: () => ProviderConfig,
  ) {
    const active = store.setting("active");
    if (active) {
      try {
        this.clock.load(store.session(active), true);
      } catch {
        /* Deleted active session. */
      }
    }
  }
  snapshot(): Snapshot {
    return {
      ...this.clock.snapshot(),
      recordingId: this.recording?.id ?? null,
      recordingRemainingMs:
        this.recording?.start == null
          ? 120000
          : Math.max(0, 120000 - (performance.now() - this.recording.start)),
    };
  }
  emit(persist = true) {
    if (persist && this.clock.session)
      this.store.saveSession(this.clock.snapshot().session!);
    this.onChange(this.snapshot());
    return this.snapshot();
  }
  tick() {
    const changed = this.clock.tick();
    if (
      this.recording?.start != null &&
      performance.now() - this.recording.start >= 120000 &&
      !this.recording.stopSent
    ) {
      this.recording.stopSent = true;
      this.onStop(this.recording.id);
    }
    const persist = changed || performance.now() - this.lastSave > 4000;
    if (persist) this.lastSave = performance.now();
    this.emit(persist);
  }
  assertIdle() {
    if (this.recording) throw new Error("请先结束当前录音。");
  }
  start(id: string) {
    this.assertIdle();
    const topic = topics.find((t) => t.id === id);
    if (!topic) throw new Error("主题不存在。");
    if (this.clock.session) {
      this.clock.command("pause", this.clock.version);
      this.emit();
    }
    const session = {
      id: randomUUID(),
      topic,
      outline: "",
      phase: "research" as const,
      remainingMs: 600000,
      paused: false,
      createdAt: new Date().toISOString(),
    };
    this.store.saveSession(session);
    this.store.event(session.id, "locked");
    this.clock.load(session);
    this.store.setSetting("active", session.id);
    return this.emit();
  }
  open(id: string, retell = false) {
    this.assertIdle();
    const s = this.store.session(id);
    if (this.clock.session) {
      this.clock.command("pause", this.clock.version);
      this.emit();
    }
    if (retell) {
      s.phase = "ready";
      s.remainingMs = 0;
      s.paused = false;
    }
    this.clock.load(s, !retell);
    this.store.setSetting("active", id);
    return this.emit();
  }
  outline(id: string, text: string) {
    const s = this.store.session(id);
    s.outline = text;
    this.store.saveSession(s);
    if (this.clock.session?.id === id) {
      this.clock.session.outline = text;
      this.emit();
    }
  }
  begin(mime: string) {
    this.assertIdle();
    const session = this.clock.session;
    if (!session || session.phase !== "ready")
      throw new Error("请先完成准备阶段。");
    const attempts = this.store.detail(session.id).attempts;
    if (attempts.some((a) => !a.submitted))
      throw new Error("请先提交或放弃已有录音草稿。");
    this.clock.notice = null;
    const id = randomUUID();
    const a: Attempt = {
      id,
      sessionId: session.id,
      number: Math.max(0, ...attempts.map((a) => a.number)) + 1,
      outline: session.outline,
      mime,
      bytes: 0,
      durationMs: 0,
      status: "recording",
      audioPath: `${id}.webm`,
      submitted: false,
      createdAt: new Date().toISOString(),
    };
    this.store.saveAttempt(a);
    try {
      this.recording = {
        id,
        fd: openSync(join(this.store.audioDir, a.audioPath + ".part"), "wx"),
        seq: 0,
        start: null,
        stopSent: false,
        bytes: 0,
      };
    } catch {
      a.status = "interrupted";
      a.error = "无法创建录音文件，请检查磁盘空间和权限。";
      this.store.saveAttempt(a);
      throw new Error(a.error);
    }
    this.emit();
    return a;
  }
  started(id: string) {
    if (this.recording?.id !== id || this.recording.start !== null)
      throw new Error("录音状态不匹配。");
    this.recording.start = performance.now();
    this.emit();
  }
  chunk(id: string, seq: number, data: ArrayBuffer) {
    const r = this.recording;
    if (!r || r.id !== id || r.seq !== seq)
      throw new Error("录音块顺序不正确。");
    if (r.bytes + data.byteLength > 32 * 1024 * 1024)
      throw new Error("录音超过 32 MB 限制。");
    const buffer = Buffer.from(data);
    let offset = 0;
    while (offset < buffer.length) {
      const n = writeSync(r.fd, buffer, offset);
      if (!n) throw new Error("录音写入失败。");
      offset += n;
    }
    r.seq++;
    r.bytes += buffer.length;
  }
  finish(
    id: string,
    durationMs: number,
    audible: boolean,
    interrupted: boolean,
  ) {
    const r = this.recording;
    if (!r || r.id !== id) throw new Error("录音已经结束。");
    const a = this.store.attempt(id);
    try {
      closeSync(r.fd);
      renameSync(
        join(this.store.audioDir, a.audioPath + ".part"),
        join(this.store.audioDir, a.audioPath),
      );
      a.bytes = statSync(join(this.store.audioDir, a.audioPath)).size;
    } finally {
      this.recording = null;
    }
    a.durationMs = durationMs;
    a.status =
      interrupted || !audible || a.bytes < 100 ? "interrupted" : "review";
    a.error = interrupted
      ? "录音已中断，请回放确认或重录。"
      : !audible || a.bytes < 100
        ? "未检测到有效声音，请检查麦克风并重录。"
        : undefined;
    this.store.saveAttempt(a);
    if (a.status === "interrupted")
      this.store.event(a.sessionId, "recording_failed");
    this.emit();
    return a;
  }
  discard(id: string) {
    if (this.recording?.id === id) throw new Error("请先结束录音。");
    this.store.deleteAttempt(id);
  }
  submit(id: string, consent: boolean) {
    if (!consent) throw new Error("请先确认上传用途与接收方。");
    if (this.tasks.has(id)) return this.tasks.get(id)!.promise;
    const a = this.store.attempt(id);
    if (
      !a.bytes ||
      a.status === "recording" ||
      (a.status === "interrupted" && a.error?.includes("有效声音"))
    )
      throw new Error("录音无效，请重录。");
    return this.runTask(a, async (provider, signal) => {
      let revision = this.store
        .detail(a.sessionId)
        .revisions.filter((r) => r.attemptId === id)
        .at(-1);
      if (!revision) {
        this.store.job(`${id}:asr`, id, "running", { type: "asr" });
        const text = await provider.transcribe(
          join(this.store.audioDir, a.audioPath),
          a.mime,
          signal,
        );
        revision = this.store.revision(this.store.attempt(id), text, "asr");
        this.store.job(`${id}:asr`, id, "done", { revision: revision.id });
      }
      const existing = this.store
        .detail(a.sessionId)
        .runs.some((r) => r.revisionId === revision.id);
      if (!existing) await this.feedback(provider, a, revision, signal);
    });
  }
  analyze(id: string, text: string, consent: boolean) {
    if (!consent) throw new Error("请先确认文字分析的接收方。");
    if (this.tasks.has(id)) return this.tasks.get(id)!.promise;
    const a = this.store.attempt(id);
    const all = this.store
      .detail(a.sessionId)
      .revisions.filter((r) => r.attemptId === id);
    if (!all.length) throw new Error("请先完成转写。");
    const previous = all.at(-1)!;
    const revision =
      text === previous.text
        ? previous
        : this.store.revision(a, text, "edited");
    return this.runTask(a, async (provider, signal) => {
      await this.feedback(provider, a, revision, signal);
    });
  }
  async feedback(
    provider: Provider,
    a: Attempt,
    revision: Revision,
    signal: AbortSignal,
  ) {
    const key = `${a.id}:feedback:${revision.id}`;
    this.store.job(key, a.id, "running", { revision: revision.id });
    const result = await provider.analyze(
      this.store.session(a.sessionId).topic,
      a.outline,
      revision.text,
      signal,
    );
    this.store.attempt(a.id);
    this.store.run({
      id: randomUUID(),
      attemptId: a.id,
      revisionId: revision.id,
      result,
      model:
        this.config().mode === "demo"
          ? "离线演示"
          : this.config().feedbackModel,
      promptVersion: "feynman-v1",
      createdAt: new Date().toISOString(),
    });
    this.store.job(key, a.id, "done", { revision: revision.id });
    this.store.event(a.sessionId, "feedback_completed");
  }
  runTask(
    a: Attempt,
    work: (provider: Provider, signal: AbortSignal) => Promise<void>,
  ) {
    a.submitted = true;
    a.status = "processing";
    a.error = undefined;
    this.store.saveAttempt(a);
    const controller = new AbortController();
    const start = performance.now();
    const promise = Promise.resolve().then(async () => {
      try {
        await work(new Provider(this.config()), controller.signal);
        const latest = this.store.attempt(a.id);
        latest.status = "feedback";
        latest.error = undefined;
        this.store.saveAttempt(latest);
      } catch (error) {
        try {
          const latest = this.store.attempt(a.id);
          latest.status = "error";
          latest.error =
            error instanceof Error && error.name !== "TimeoutError"
              ? error.message
              : "服务超时，可能已产生费用。录音已保留，请确认后重试。";
          this.store.saveAttempt(latest);
          this.store.db
            .prepare(
              "UPDATE jobs SET status='failed' WHERE attempt_id=? AND status='running'",
            )
            .run(a.id);
        } catch {
          /* Deleted while request was in flight. */
        }
        throw error;
      } finally {
        this.tasks.delete(a.id);
        try {
          this.store.event(
            a.sessionId,
            "service_duration",
            Math.round(performance.now() - start),
          );
        } catch {
          /* Deleted session. */
        }
        this.emit(false);
      }
    });
    this.tasks.set(a.id, { controller, promise });
    return promise;
  }
  remove(id: string) {
    if (
      this.recording &&
      this.store.attempt(this.recording.id).sessionId === id
    )
      throw new Error("请先结束录音再删除。");
    for (const a of this.store.detail(id).attempts)
      this.tasks.get(a.id)?.controller.abort();
    this.store.remove(id);
    if (this.clock.session?.id === id) {
      this.clock.session = null;
      this.clock.version++;
      this.store.setSetting("active", "");
      this.emit(false);
    }
  }
  suspend() {
    this.clock.suspend();
    if (this.recording) this.onStop(this.recording.id);
    this.emit();
  }
}
