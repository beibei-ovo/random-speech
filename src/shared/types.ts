import { z } from "zod";

export type Topic = {
  id: string;
  category: string;
  title: string;
  prompt: string;
  keywords: string[];
};

export type Phase = "research" | "organize" | "ready";

export type Session = {
  id: string;
  topic: Topic;
  outline: string;
  phase: Phase;
  remainingMs: number;
  paused: boolean;
  createdAt: string;
  deleted?: boolean;
};

export const timingStateSchema = z.enum(["available", "missing", "invalid"]);
export type TimingState = z.infer<typeof timingStateSchema>;

const timedTextSchema = z.object({
  text: z.string().min(1).max(1000),
  startMs: z.number().finite().nonnegative(),
  endMs: z.number().finite().positive(),
});

export const transcriptTimingSchema = z.object({
  segment: timingStateSchema,
  word: timingStateSchema,
  source: z.string().max(120).optional(),
});

export const providerMetaSchema = z.object({
  provider: z.string().min(1).max(160),
  model: z.string().min(1).max(160),
  adapterVersion: z.string().min(1).max(80),
  requestId: z.string().max(300).optional(),
});

export const transcriptionResultSchema = z
  .object({
    text: z.string().trim().min(1).max(30000),
    segments: z.array(timedTextSchema).max(10000).optional(),
    words: z.array(timedTextSchema).max(100000).optional(),
    timing: transcriptTimingSchema,
    providerMeta: providerMetaSchema,
  })
  .superRefine((value, ctx) => {
    for (const [name, items] of [
      ["segments", value.segments],
      ["words", value.words],
    ] as const) {
      if (!items) continue;
      let previous = -1;
      for (const [index, item] of items.entries()) {
        if (item.endMs <= item.startMs || item.startMs < previous) {
          ctx.addIssue({
            code: "custom",
            path: [name, index],
            message: "时间戳必须按顺序排列且结束时间晚于开始时间。",
          });
        }
        previous = item.startMs;
      }
    }
    if (value.segments && value.timing.segment !== "available")
      ctx.addIssue({
        code: "custom",
        path: ["timing", "segment"],
        message: "存在分段时间戳时必须标记为 available。",
      });
    if (value.words && value.timing.word !== "available")
      ctx.addIssue({
        code: "custom",
        path: ["timing", "word"],
        message: "存在词级时间戳时必须标记为 available。",
      });
  });
export type TranscriptTiming = z.infer<typeof transcriptTimingSchema>;
export type ProviderMeta = z.infer<typeof providerMetaSchema>;
export type TimedText = z.infer<typeof timedTextSchema>;
export type TranscriptionResult = z.infer<typeof transcriptionResultSchema>;

export const audioIntervalSchema = z.object({
  startMs: z.number().finite().nonnegative(),
  endMs: z.number().finite().nonnegative(),
});
export type AudioInterval = z.infer<typeof audioIntervalSchema>;

export const audioSummarySchema = z.object({
  algorithmVersion: z.string().min(1).max(80),
  durationMs: z.number().finite().nonnegative(),
  sampleWindowMs: z.number().finite().positive(),
  sampleCount: z.number().int().nonnegative(),
  rms: z.object({
    mean: z.number().finite().nonnegative(),
    min: z.number().finite().nonnegative(),
    max: z.number().finite().nonnegative(),
  }),
  peak: z.number().finite().nonnegative(),
  lowLevelIntervals: z.array(audioIntervalSchema).max(10000),
  vadIntervals: z.array(audioIntervalSchema).max(10000),
});
export type AudioSummary = z.infer<typeof audioSummarySchema>;

export const derivedMetricsSchema = z.object({
  algorithmVersion: z.string().min(1).max(80),
  characterCount: z.number().int().nonnegative(),
  speakingRate: z.object({
    value: z.number().finite().nonnegative(),
    unit: z.literal("characters/minute"),
    denominator: z.enum(["recording", "vad"]),
  }),
  fillerWords: z
    .array(z.object({ word: z.string().min(1), count: z.number().int().positive() }))
    .max(40),
  repetitionPatterns: z
    .array(z.object({ pattern: z.string().min(1), count: z.number().int().positive() }))
    .max(40),
  pauseSummary: z.object({
    count: z.number().int().nonnegative(),
    totalMs: z.number().finite().nonnegative(),
    leadingMs: z.number().finite().nonnegative(),
    trailingMs: z.number().finite().nonnegative(),
    alignedCount: z.number().int().nonnegative(),
  }),
});
export type DerivedMetrics = z.infer<typeof derivedMetricsSchema>;

export type Attempt = {
  id: string;
  sessionId: string;
  number: number;
  outline: string;
  mime: string;
  bytes: number;
  durationMs: number;
  status:
    | "recording"
    | "review"
    | "processing"
    | "feedback"
    | "interrupted"
    | "error";
  audioPath: string;
  audioSummary?: AudioSummary;
  error?: string;
  submitted: boolean;
  createdAt: string;
};

export type Revision = {
  id: string;
  attemptId: string;
  version: number;
  text: string;
  source: "asr" | "edited";
  providerMeta?: ProviderMeta;
  segments?: TimedText[];
  words?: TimedText[];
  timing: TranscriptTiming;
  alignmentStatus: "available" | "missing" | "invalid" | "needs_realign";
  createdAt: string;
};

export const feedbackSchema = z.object({
  summary: z.string().min(1).max(3000),
  dimensions: z.object({
    understanding: z.string(),
    structure: z.string(),
    simplicity: z.string(),
  }),
  strengths: z.array(z.string()).max(6),
  improvements: z
    .array(z.object({ quote: z.string().min(1), advice: z.string().min(1) }))
    .max(3),
  simplified: z.string(),
  questions: z.array(z.string()).max(8),
  uncertainties: z.array(z.string()).max(8),
});
export type Feedback = z.infer<typeof feedbackSchema>;

export type Run = {
  id: string;
  attemptId: string;
  revisionId: string;
  result: Feedback;
  service?: string;
  model: string;
  adapterVersion?: string;
  promptVersion: string;
  audioSummaryVersion?: string;
  derivedMetrics?: DerivedMetrics;
  createdAt: string;
  helpful?: boolean;
};

export type Detail = {
  session: Session;
  attempts: Attempt[];
  revisions: Revision[];
  runs: Run[];
};

export const serviceConfigSchema = z.object({
  providerName: z.string().min(1).max(160),
  adapterId: z.string().min(1).max(100),
  baseUrl: z
    .url()
    .refine((s) => s.startsWith("https://"), "服务地址必须使用 HTTPS"),
  credentialRef: z.string().min(1).max(120),
  model: z.string().min(1).max(160),
  recipient: z.string().min(1).max(160),
  retention: z.string().max(1000),
  adapterVersion: z.string().min(1).max(80),
});
export type ServiceConfig = z.infer<typeof serviceConfigSchema>;

export const settingsSchema = z.object({
  mode: z.enum(["demo", "cloud"]),
  transcription: serviceConfigSchema,
  feedback: serviceConfigSchema,
  reuseTranscriptionConnection: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema> & {
  transcriptionHasKey: boolean;
  feedbackHasKey: boolean;
  hasKey: boolean;
  persistentKey: boolean;
  /** Legacy display fields retained for older renderer integrations. */
  baseUrl?: string;
  asrModel?: string;
  feedbackModel?: string;
  providerName?: string;
  retention?: string;
};

export type Snapshot = {
  version: number;
  session: Session | null;
  recordingId: string | null;
  recordingRemainingMs: number;
  notice: string | null;
};

export type Api = {
  snapshot(): Promise<Snapshot>;
  subscribe(fn: (s: Snapshot) => void): () => void;
  topics(): Promise<Topic[]>;
  start(topicId: string): Promise<Snapshot>;
  pause(version: number): Promise<Snapshot>;
  resume(version: number): Promise<Snapshot>;
  next(version: number): Promise<Snapshot>;
  outline(sessionId: string, text: string): Promise<void>;
  history(): Promise<
    (Session & { count: number; bytes: number; completed: boolean })[]
  >;
  detail(id: string): Promise<Detail>;
  remove(id: string): Promise<void>;
  openSession(id: string): Promise<Snapshot>;
  retell(id: string): Promise<Snapshot>;
  permitMicrophone(): Promise<void>;
  begin(mime: string): Promise<Attempt>;
  recordingStarted(id: string): Promise<void>;
  chunk(id: string, seq: number, data: ArrayBuffer): Promise<void>;
  finish(
    id: string,
    durationMs: number,
    audible: boolean,
    interrupted: boolean,
    audioSummary?: AudioSummary,
  ): Promise<Attempt>;
  discard(id: string): Promise<void>;
  submit(id: string, consent: boolean): Promise<void>;
  analyze(id: string, text: string, consent: boolean): Promise<void>;
  helpful(id: string, value: boolean): Promise<void>;
  settings(): Promise<Settings>;
  saveSettings(
    value: z.infer<typeof settingsSchema> & {
      transcriptionKey?: string;
      feedbackKey?: string;
      key?: string;
    },
  ): Promise<Settings>;
  testTranscription(): Promise<{ ok: boolean; message: string }>;
  testFeedback(): Promise<{ ok: boolean; message: string }>;
  floating(show: boolean): Promise<void>;
  showMain(): Promise<void>;
};

declare global {
  interface Window {
    api: Api;
  }
}
