import { describe, it, expect } from "vitest";
import { localAsset, audioRange } from "../../src/main/security";
import { resolve } from "node:path";
describe("local protocol boundaries", () => {
  it("maps only assets inside the renderer root", () => {
    expect(localAsset(resolve("out/renderer"), "/")).toBe(
      resolve("out/renderer/index.html"),
    );
    for (const path of [
      "/../secret",
      "/%2e%2e/secret",
      "/a\\..\\secret",
      "/%00",
    ])
      expect(() => localAsset(resolve("out/renderer"), path)).toThrow();
  });
  it("supports normal, open and suffix audio ranges", () => {
    expect(audioRange("bytes=0-99", 200)).toEqual({ start: 0, end: 99 });
    expect(audioRange("bytes=100-", 200)).toEqual({ start: 100, end: 199 });
    expect(audioRange("bytes=-50", 200)).toEqual({ start: 150, end: 199 });
    expect(audioRange(null, 200)).toBeNull();
  });
  it("rejects unsatisfiable and multipart ranges", () => {
    for (const h of [
      "bytes=200-",
      "bytes=3-1",
      "bytes=0-1,4-5",
      "bytes=-",
      "bytes=-0",
    ])
      expect(() => audioRange(h, 200)).toThrow();
  });
});
