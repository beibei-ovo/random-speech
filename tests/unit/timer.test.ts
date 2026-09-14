import { describe, it, expect } from "vitest";
import { TrainingClock } from "../../src/main/timer";
import topics from "../../resources/topics.json";
const session = () => ({
  id: "test",
  topic: topics[0],
  outline: "",
  phase: "research" as const,
  remainingMs: 600000,
  paused: false,
  createdAt: "2026-09-14",
});
describe("authoritative preparation timer", () => {
  it("runs 600 then 300 seconds and never starts recording", () => {
    let now = 0;
    const c = new TrainingClock(() => now);
    c.load(session());
    now = 600000;
    expect(c.tick()).toBe(true);
    expect(c.session?.phase).toBe("organize");
    now += 300000;
    c.tick();
    expect(c.session?.phase).toBe("ready");
    expect(c.snapshot().recordingId).toBeNull();
    now += 900000;
    expect(c.tick()).toBe(false);
  });
  it("pauses without consuming time and resumes the exact remainder", () => {
    let now = 0;
    const c = new TrainingClock(() => now);
    c.load(session());
    now = 125000;
    c.command("pause", c.version);
    now += 999999;
    expect(c.remaining()).toBe(475000);
    c.command("resume", c.version);
    now += 10000;
    expect(c.remaining()).toBe(465000);
  });
  it("ignores duplicate/stale transitions", () => {
    const c = new TrainingClock(() => 0);
    c.load(session());
    const v = c.version;
    c.command("next", v);
    c.command("next", v);
    expect(c.session?.phase).toBe("organize");
  });
  it("recovers paused and pauses on suspend", () => {
    const c = new TrainingClock(() => 0);
    c.load(session(), true);
    expect(c.session?.paused).toBe(true);
    c.command("resume", c.version);
    c.suspend();
    expect(c.session?.paused).toBe(true);
  });
  it("gives the next phase its full duration after an event loop delay", () => {
    let now = 0;
    const c = new TrainingClock(() => now);
    c.load(session());
    now = 1000000;
    c.tick();
    expect(c.remaining()).toBe(300000);
  });
});
