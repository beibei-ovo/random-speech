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
  model: string;
  promptVersion: string;
  createdAt: string;
  helpful?: boolean;
};
export type Detail = {
  session: Session;
  attempts: Attempt[];
  revisions: Revision[];
  runs: Run[];
};
export type Snapshot = {
  version: number;
  session: Session | null;
  recordingId: string | null;
  recordingRemainingMs: number;
  notice: string | null;
};
export const settingsSchema = z.object({
  mode: z.enum(["demo", "cloud"]),
  baseUrl: z
    .url()
    .refine((s) => s.startsWith("https://"), "服务地址必须使用 HTTPS"),
  asrModel: z.string().min(1).max(100),
  feedbackModel: z.string().min(1).max(100),
  providerName: z.string().min(1).max(100),
  retention: z.string().max(1000),
});
export type Settings = z.infer<typeof settingsSchema> & {
  hasKey: boolean;
  persistentKey: boolean;
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
  ): Promise<Attempt>;
  discard(id: string): Promise<void>;
  submit(id: string, consent: boolean): Promise<void>;
  analyze(id: string, text: string, consent: boolean): Promise<void>;
  helpful(id: string, value: boolean): Promise<void>;
  settings(): Promise<Settings>;
  saveSettings(
    value: z.infer<typeof settingsSchema> & { key?: string },
  ): Promise<Settings>;
  floating(show: boolean): Promise<void>;
  showMain(): Promise<void>;
};
declare global {
  interface Window {
    api: Api;
  }
}
