import type { Attempt } from "../../shared/types";
import { createAudioSummary } from "../../shared/metrics";
export class Recorder {
  media: MediaRecorder | null = null;
  stream: MediaStream | null = null;
  context: AudioContext | null = null;
  timer: ReturnType<typeof setInterval> | null = null;
  id = "";
  startTime = 0;
  audible = false;
  interrupted = false;
  writeError = false;
  queue = Promise.resolve();
  pending = 0;
  seq = 0;
  samples: Array<{ atMs: number; rms: number; peak: number }> = [];
  constructor(
    private onDone: (a: Attempt) => void,
    private onError: (s: string) => void,
    private onLevel: (n: number) => void,
  ) {}
  async start() {
    try {
      await window.api.permitMicrophone();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const mime = ["audio/webm;codecs=opus", "audio/webm"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      if (!mime) throw new Error("当前设备不支持 WebM 录音。");
      this.context = new AudioContext();
      await this.context.resume();
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 1024;
      this.context.createMediaStreamSource(this.stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      this.timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(
          samples.reduce((s, x) => s + x * x, 0) / samples.length,
        );
        const peak = samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
        if (this.startTime)
          this.samples.push({
            atMs: Math.max(0, performance.now() - this.startTime),
            rms,
            peak,
          });
        if (rms > 0.006) this.audible = true;
        this.onLevel(Math.min(1, rms * 8));
        if (this.startTime && performance.now() - this.startTime >= 120000)
          this.stop();
      }, 100);
      const a = await window.api.begin(mime);
      this.id = a.id;
      this.media = new MediaRecorder(this.stream, {
        mimeType: mime,
        audioBitsPerSecond: 64000,
      });
      this.media.ondataavailable = (event) => {
        if (!event.data.size) return;
        this.pending += event.data.size;
        if (this.pending > 8 * 1024 * 1024) {
          this.interrupted = true;
          this.onError("磁盘写入过慢，录音已停止。");
          this.stop(true);
        }
        this.queue = this.queue
          .then(async () => {
            if (!this.writeError) {
              await window.api.chunk(
                this.id,
                this.seq,
                await event.data.arrayBuffer(),
              );
              this.seq++;
            }
          })
          .catch(() => {
            this.writeError = true;
            this.interrupted = true;
            this.onError("录音写入失败，已停止录音，请检查磁盘后重试。");
            this.stop(true);
          })
          .finally(() => {
            this.pending -= event.data.size;
          });
      };
      this.media.onstop = () => {
        void this.complete();
      };
      this.media.onerror = () => this.stop(true);
      this.stream.getAudioTracks().forEach((t) => {
        t.onended = () => this.stop(true);
      });
      this.media.start(1000);
      this.startTime = performance.now();
      await window.api.recordingStarted(a.id);
    } catch (e) {
      this.cleanup();
      if (this.id) {
        try {
          await window.api.finish(this.id, 0, false, true);
        } catch {
          /* Already finalized. */
        }
      }
      const name = e instanceof Error ? e.name : "";
      this.onError(
        name === "NotAllowedError"
          ? "麦克风权限被拒绝。请在系统隐私设置中允许麦克风后重试。"
          : name === "NotFoundError"
            ? "未找到麦克风，请连接设备后重试。"
            : name === "NotReadableError"
              ? "麦克风无法使用，可能被其他应用占用。"
              : e instanceof Error
                ? e.message
                : "无法开始录音。",
      );
      throw e;
    }
  }
  stop(interrupted = false) {
    this.interrupted ||= interrupted;
    if (this.media?.state === "recording") this.media.stop();
  }
  async complete() {
    const duration = performance.now() - this.startTime;
    await this.queue;
    const audioSummary = createAudioSummary({
      durationMs: duration,
      rmsSamples: this.samples,
    });
    this.cleanup();
    try {
      this.onDone(
        await window.api.finish(
          this.id,
          duration,
          this.audible,
          this.interrupted || this.writeError,
          audioSummary,
        ),
      );
    } catch {
      this.onError("录音保存失败，草稿将在下次启动时尝试恢复。");
    }
  }
  cleanup() {
    if (this.timer) clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    void this.context?.close();
    this.onLevel(0);
  }
}
