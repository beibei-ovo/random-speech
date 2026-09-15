import Database from "better-sqlite3";
import {
  mkdirSync,
  existsSync,
  readdirSync,
  unlinkSync,
  renameSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  transcriptionResultSchema,
  type Session,
  type Attempt,
  type Revision,
  type Run,
  type Detail,
  type TranscriptionResult,
} from "../shared/types";
export class Store {
  db: Database.Database;
  audioDir: string;
  constructor(root: string) {
    mkdirSync(root, { recursive: true });
    this.audioDir = join(root, "audio");
    mkdirSync(this.audioDir, { recursive: true });
    this.db = new Database(join(root, "training.sqlite"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    const version = this.db.pragma("user_version", { simple: true }) as number;
    if (version > 2)
      throw new Error("数据库版本高于当前应用，请使用较新版本。");
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE, revision_id TEXT NOT NULL REFERENCES revisions(id) ON DELETE CASCADE, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE, status TEXT NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, type TEXT NOT NULL, elapsed INTEGER, created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      `);
      this.migrate(version);
    })();
    this.recover();
  }
  private migrate(version: number) {
    if (version < 2) {
      for (const row of this.db.prepare("SELECT id, data FROM revisions").all() as {
        id: string;
        data: string;
      }[]) {
        const revision = JSON.parse(row.data) as Partial<Revision>;
        const normalized = {
          ...revision,
          timing: revision.timing || { segment: "missing", word: "missing" },
          alignmentStatus:
            revision.alignmentStatus ||
            (revision.source === "edited" ? "needs_realign" : "missing"),
        };
        this.db
          .prepare("UPDATE revisions SET data=? WHERE id=?")
          .run(JSON.stringify(normalized), row.id);
      }
    }
    this.db.pragma("user_version = 2");
  }
  setting(key: string): string | undefined {
    return (
      this.db.prepare("SELECT value FROM settings WHERE id=?").get(key) as
        | { value: string }
        | undefined
    )?.value;
  }
  setSetting(key: string, value: string) {
    this.db
      .prepare("INSERT OR REPLACE INTO settings VALUES (?,?)")
      .run(key, value);
  }
  session(id: string): Session {
    const row = this.db
      .prepare("SELECT data FROM sessions WHERE id=? AND deleted=0")
      .get(id) as { data: string } | undefined;
    if (!row) throw new Error("训练记录不存在或已删除。");
    return JSON.parse(row.data);
  }
  saveSession(s: Session) {
    this.db
      .prepare(
        "INSERT INTO sessions(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(s.id, JSON.stringify(s));
  }
  sessions(): Session[] {
    return (
      this.db
        .prepare(
          "SELECT data FROM sessions WHERE deleted=0 ORDER BY rowid DESC",
        )
        .all() as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  saveAttempt(a: Attempt) {
    this.session(a.sessionId);
    this.db
      .prepare(
        "INSERT INTO attempts VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(a.id, a.sessionId, JSON.stringify(a));
  }
  attempt(id: string): Attempt {
    const row = this.db
      .prepare("SELECT data FROM attempts WHERE id=?")
      .get(id) as { data: string } | undefined;
    if (!row) throw new Error("录音不存在。");
    const a: Attempt = JSON.parse(row.data);
    this.session(a.sessionId);
    return a;
  }
  detail(id: string): Detail {
    const session = this.session(id);
    const attempts = (
      this.db
        .prepare("SELECT data FROM attempts WHERE session_id=? ORDER BY rowid")
        .all(id) as { data: string }[]
    ).map((r) => JSON.parse(r.data) as Attempt);
    const revisions = (
      this.db
        .prepare(
          "SELECT r.data FROM revisions r JOIN attempts a ON r.attempt_id=a.id WHERE a.session_id=? ORDER BY r.rowid",
        )
        .all(id) as { data: string }[]
    ).map((r) => JSON.parse(r.data) as Revision);
    const runs = (
      this.db
        .prepare(
          "SELECT r.data FROM runs r JOIN attempts a ON r.attempt_id=a.id WHERE a.session_id=? ORDER BY r.rowid",
        )
        .all(id) as { data: string }[]
    ).map((r) => JSON.parse(r.data) as Run);
    return { session, attempts, revisions, runs };
  }
  revision(
    a: Attempt,
    value: string | TranscriptionResult,
    source: Revision["source"],
  ) {
    this.session(a.sessionId);
    const all = this.detail(a.sessionId).revisions.filter(
      (r) => r.attemptId === a.id,
    );
    if (source === "asr" && all.some((r) => r.source === "asr"))
      throw new Error("原始转写不能覆盖。");
    const result =
      typeof value === "string"
        ? transcriptionResultSchema.parse({
            text: value,
            timing: { segment: "missing", word: "missing" },
            providerMeta: {
              provider: "unknown",
              model: "unknown",
              adapterVersion: "unknown",
            },
          })
        : transcriptionResultSchema.parse(value);
    const revision: Revision = {
      id: randomUUID(),
      attemptId: a.id,
      text: result.text,
      source,
      version: all.length + 1,
      providerMeta: source === "asr" ? result.providerMeta : undefined,
      segments: source === "asr" ? result.segments : undefined,
      words: source === "asr" ? result.words : undefined,
      timing:
        source === "asr"
          ? result.timing
          : { segment: "missing", word: "missing" },
      alignmentStatus:
        source === "edited"
          ? "needs_realign"
          : result.timing.segment === "invalid" ||
              result.timing.word === "invalid"
            ? "invalid"
            : result.timing.segment === "available" ||
                result.timing.word === "available"
              ? "available"
              : "missing",
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare("INSERT INTO revisions VALUES (?,?,?)")
      .run(revision.id, a.id, JSON.stringify(revision));
    return revision;
  }
  run(r: Run) {
    const a = this.attempt(r.attemptId);
    this.session(a.sessionId);
    this.db
      .prepare("INSERT OR REPLACE INTO runs VALUES (?,?,?,?)")
      .run(r.id, r.attemptId, r.revisionId, JSON.stringify(r));
  }
  event(session: string, type: string, elapsed: number | null = null) {
    this.db
      .prepare("INSERT INTO events VALUES (?,?,?,?,?)")
      .run(randomUUID(), session, type, elapsed, new Date().toISOString());
  }
  job(id: string, attempt: string, status: string, data: unknown) {
    this.attempt(attempt);
    this.db
      .prepare("INSERT OR REPLACE INTO jobs VALUES (?,?,?,?)")
      .run(id, attempt, status, JSON.stringify(data));
  }
  deleteAttempt(id: string) {
    const a = this.attempt(id);
    if (a.submitted) throw new Error("已提交的演讲需要通过删除整条训练清理。");
    for (const suffix of ["", ".part"]) {
      const file = join(this.audioDir, a.audioPath + suffix);
      if (existsSync(file)) unlinkSync(file);
    }
    this.db.prepare("DELETE FROM attempts WHERE id=?").run(id);
  }
  remove(id: string) {
    const rows = this.db
      .prepare("SELECT data FROM attempts WHERE session_id=?")
      .all(id) as { data: string }[];
    this.db.prepare("UPDATE sessions SET deleted=1 WHERE id=?").run(id);
    for (const row of rows) {
      const a: Attempt = JSON.parse(row.data);
      for (const suffix of ["", ".part"]) {
        const p = join(this.audioDir, a.audioPath + suffix);
        if (existsSync(p)) unlinkSync(p);
      }
    }
    this.db.prepare("DELETE FROM sessions WHERE id=?").run(id);
  }
  recover() {
    for (const row of this.db
      .prepare("SELECT id FROM sessions WHERE deleted=1")
      .all() as { id: string }[])
      this.remove(row.id);
    const known = new Set<string>();
    for (const row of this.db.prepare("SELECT data FROM attempts").all() as {
      data: string;
    }[]) {
      const a: Attempt = JSON.parse(row.data);
      const p = join(this.audioDir, a.audioPath);
      known.add(a.audioPath);
      if (existsSync(p + ".part")) {
        renameSync(p + ".part", p);
        a.status = "interrupted";
        a.error = "发现中断录音，请先回放确认；无法播放时请重录。";
      }
      if (a.status === "recording") {
        a.status = "interrupted";
        a.error = "录音因应用退出而中断，请回放确认或重录。";
      }
      if (a.status === "processing") {
        a.status = "error";
        a.error = "上次服务请求未完成，可能已产生费用，请确认后重试。";
      }
      a.bytes = existsSync(p) ? statSync(p).size : 0;
      if (!a.bytes) {
        a.status = "interrupted";
        a.error = "录音文件为空或缺失，请重录。";
      }
      this.saveAttempt(a);
    }
    for (const name of readdirSync(this.audioDir))
      if (!known.has(name)) unlinkSync(join(this.audioDir, name));
    this.db
      .prepare("UPDATE jobs SET status='interrupted' WHERE status='running'")
      .run();
  }
}
