import { describe, expect, it } from "vitest";
import { calculateDerivedMetrics, createAudioSummary } from "../../src/shared/metrics";

describe("explainable audio and transcript metrics", () => {
  it("summarizes relative amplitude without dB or emotion", () => {
    const summary = createAudioSummary({
      durationMs: 500,
      rmsSamples: [
        { atMs: 0, rms: 0, peak: 0 },
        { atMs: 100, rms: 0.02, peak: 0.1 },
        { atMs: 200, rms: 0, peak: 0 },
        { atMs: 300, rms: 0.03, peak: 0.2 },
      ],
    });
    expect(summary.algorithmVersion).toBe("audio-v1");
    expect(summary.peak).toBe(0.2);
    expect(summary.lowLevelIntervals.length).toBeGreaterThan(0);
    expect(JSON.stringify(summary)).not.toContain("dB");
  });
  it("recomputes text metrics from the current revision", () => {
    const result = calculateDerivedMetrics(
      "嗯 我觉得 这个 这个 概念很重要",
      60000,
      undefined,
      { segment: "missing", word: "missing" },
    );
    expect(result.characterCount).toBeGreaterThan(0);
    expect(result.fillerWords.find((item) => item.word === "嗯")?.count).toBe(1);
    expect(result.repetitionPatterns.length).toBeGreaterThan(0);
    expect(result.speakingRate.denominator).toBe("recording");
  });
});
