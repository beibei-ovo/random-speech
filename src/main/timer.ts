import type { Session, Snapshot } from "../shared/types";
export class TrainingClock {
  version = 0;
  session: Session | null = null;
  deadline = 0;
  notice: string | null = null;
  constructor(private now = () => performance.now()) {}
  load(session: Session, recovered = false) {
    this.session = {
      ...session,
      paused: recovered && session.phase !== "ready" ? true : session.paused,
    };
    this.deadline = this.now() + session.remainingMs;
    this.notice = recovered
      ? "已恢复上次训练，准备计时已暂停。异常退出的计时恢复误差最多约 5 秒。"
      : null;
    this.version++;
  }
  remaining() {
    return !this.session
      ? 0
      : this.session.paused || this.session.phase === "ready"
        ? this.session.remainingMs
        : Math.max(0, this.deadline - this.now());
  }
  snapshot(): Snapshot {
    return {
      version: this.version,
      session: this.session
        ? { ...this.session, remainingMs: this.remaining() }
        : null,
      recordingId: null,
      recordingRemainingMs: 0,
      notice: this.notice,
    };
  }
  command(action: "pause" | "resume" | "next", version: number) {
    if (
      version !== this.version ||
      !this.session ||
      this.session.phase === "ready"
    )
      return false;
    if (action === "pause" && !this.session.paused) {
      this.session.remainingMs = this.remaining();
      this.session.paused = true;
    } else if (action === "resume" && this.session.paused) {
      this.deadline = this.now() + this.session.remainingMs;
      this.session.paused = false;
      this.notice = null;
    } else if (action === "next") {
      this.advance();
      return true;
    } else return false;
    this.version++;
    return true;
  }
  advance() {
    if (!this.session || this.session.phase === "ready") return;
    this.session.phase =
      this.session.phase === "research" ? "organize" : "ready";
    this.session.remainingMs = this.session.phase === "organize" ? 300000 : 0;
    this.session.paused = false;
    this.deadline = this.now() + this.session.remainingMs;
    this.notice =
      this.session.phase === "ready"
        ? "准备完成，点击开始录音后才会收音。"
        : "查资料时间结束，进入整理阶段。";
    this.version++;
  }
  tick() {
    if (
      this.session &&
      !this.session.paused &&
      this.session.phase !== "ready" &&
      this.remaining() <= 0
    ) {
      this.advance();
      return true;
    }
    return false;
  }
  suspend() {
    if (this.session && this.command("pause", this.version))
      this.notice = "系统已休眠，计时已暂停，请手动继续。";
  }
}
