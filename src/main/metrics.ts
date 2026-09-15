import type {
  AudioSummary,
  DerivedMetrics,
  TimedText,
  TranscriptTiming,
} from "../shared/types";

const FILLERS = [
  "嗯",
  "呃",
  "那个",
  "然后",
  "就是",
  "其实",
  "我觉得",
  "对吧",
];

function meaningfulCharacters(text: string) {
  return Array.from(text).filter((char) => /[\p{L}\p{N}\u3400-\u9fff]/u.test(char))
    .length;
}

function countsOf(text: string, words: string[]) {
  return words
    .map((word) => ({
      word,
      count: text.split(word).length - 1,
    }))
    .filter((item) => item.count > 0);
}

function repeatedBigrams(text: string) {
  const compact = text.replace(/\s+/g, "");
  const counts = new Map<string, number>();
  for (let i = 0; i + 1 < compact.length; i++) {
    const pair = compact.slice(i, i + 2);
    if (/^[\p{L}\p{N}\u3400-\u9fff]{2}$/u.test(pair))
      counts.set(pair, (counts.get(pair) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([pattern, count]) => ({ pattern, count }));
}

function pauseSummary(
  durationMs: number,
  audioSummary: AudioSummary | undefined,
  timing: TranscriptTiming | undefined,
  segments: TimedText[] | undefined,
): DerivedMetrics["pauseSummary"] {
  const intervals = audioSummary?.lowLevelIntervals || [];
  const valid = intervals.filter(
    (item) => item.endMs > item.startMs && item.startMs < durationMs,
  );
  const clipped = valid.map((item) => ({
    startMs: Math.max(0, item.startMs),
    endMs: Math.min(durationMs, item.endMs),
  }));
  return {
    count: clipped.length,
    totalMs: clipped.reduce((sum, item) => sum + item.endMs - item.startMs, 0),
    leadingMs: clipped
      .filter((item) => item.startMs <= 100)
      .reduce((max, item) => Math.max(max, item.endMs), 0),
    trailingMs: clipped
      .filter((item) => item.endMs >= durationMs - 100)
      .reduce((max, item) => Math.max(max, durationMs - item.startMs), 0),
    alignedCount:
      timing?.segment === "available" && segments
        ? Math.max(0, segments.length - 1)
        : 0,
  };
}

export function calculateDerivedMetrics(
  text: string,
  durationMs: number,
  audioSummary?: AudioSummary,
  timing?: TranscriptTiming,
  segments?: TimedText[],
): DerivedMetrics {
  const characterCount = meaningfulCharacters(text);
  const safeDuration = Math.max(1, durationMs);
  const denominator = audioSummary?.vadIntervals.length ? "vad" : "recording";
  const denominatorMs =
    denominator === "vad"
      ? audioSummary!.vadIntervals.reduce(
          (sum, item) => sum + Math.max(0, item.endMs - item.startMs),
          0,
        )
      : safeDuration;
  return {
    algorithmVersion: "metrics-v1",
    characterCount,
    speakingRate: {
      value: Number(((characterCount * 60000) / Math.max(1, denominatorMs)).toFixed(2)),
      unit: "characters/minute",
      denominator,
    },
    fillerWords: countsOf(text, FILLERS),
    repetitionPatterns: repeatedBigrams(text),
    pauseSummary: pauseSummary(durationMs, audioSummary, timing, segments),
  };
}

export function createAudioSummary(input: {
  durationMs: number;
  rmsSamples: Array<{ atMs: number; rms: number; peak: number }>;
  lowLevelThreshold?: number;
  vadThreshold?: number;
  windowMs?: number;
}): AudioSummary {
  const windowMs = input.windowMs || 100;
  const threshold = input.lowLevelThreshold ?? 0.006;
  const vadThreshold = input.vadThreshold ?? threshold * 1.5;
  const samples = input.rmsSamples.filter(
    (sample) =>
      Number.isFinite(sample.atMs) &&
      Number.isFinite(sample.rms) &&
      Number.isFinite(sample.peak),
  );
  const intervals = (cutoff: number) => {
    const result: Array<{ startMs: number; endMs: number }> = [];
    let start: number | null = null;
    for (const sample of samples) {
      if (sample.rms <= cutoff) {
        start ??= Math.max(0, sample.atMs);
      } else if (start !== null) {
        result.push({ startMs: start, endMs: Math.min(input.durationMs, sample.atMs) });
        start = null;
      }
    }
    if (start !== null)
      result.push({ startMs: start, endMs: Math.max(start, input.durationMs) });
    return result.filter((item) => item.endMs > item.startMs);
  };
  const rms = samples.map((sample) => Math.max(0, sample.rms));
  return {
    algorithmVersion: "audio-v1",
    durationMs: Math.max(0, input.durationMs),
    sampleWindowMs: windowMs,
    sampleCount: samples.length,
    rms: {
      mean: rms.length ? rms.reduce((sum, value) => sum + value, 0) / rms.length : 0,
      min: rms.length ? Math.min(...rms) : 0,
      max: rms.length ? Math.max(...rms) : 0,
    },
    peak: samples.length
      ? Math.max(...samples.map((sample) => Math.max(0, sample.peak)))
      : 0,
    lowLevelIntervals: intervals(threshold),
    vadIntervals: intervals(vadThreshold).length
      ? intervals(vadThreshold).map((item) => ({
          startMs: item.startMs,
          endMs: item.endMs,
        }))
      : samples
          .filter((sample) => sample.rms > vadThreshold)
          .map((sample) => ({
            startMs: Math.max(0, sample.atMs),
            endMs: Math.min(input.durationMs, sample.atMs + windowMs),
          }))
          .filter((item) => item.endMs > item.startMs),
  };
}
