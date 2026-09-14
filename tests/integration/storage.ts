import {
  mkdtempSync,
  rmSync,
  readdirSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { Store } from "../../src/main/store";
import { TrainingService } from "../../src/main/service";
const root = mkdtempSync(join(tmpdir(), "speech-storage-"));
let store = new Store(root);
const config = () => ({
  mode: "demo" as const,
  baseUrl: "https://example.test",
  asrModel: "test",
  feedbackModel: "test",
  key: "",
});
async function main() {
  const service = new TrainingService(store, config);
  service.start("feynman");
  const id = service.clock.session!.id;
  service.clock.command("next", service.clock.version);
  service.clock.command("next", service.clock.version);
  service.outline(id, "保留提纲");
  let a = service.begin("audio/webm");
  service.started(a.id);
  let stops = 0;
  service.onStop = () => {
    stops++;
  };
  service.recording!.start = performance.now() - 120001;
  service.tick();
  service.tick();
  assert.equal(stops, 1);
  assert.throws(() => service.chunk(a.id, 1, new ArrayBuffer(200)));
  service.chunk(a.id, 0, new ArrayBuffer(200));
  a = service.finish(a.id, 2000, true, false);
  assert.equal(a.status, "review");
  assert.equal(a.bytes, 200);
  const first = service.submit(a.id, true);
  const duplicate = service.submit(a.id, true);
  assert.equal(first, duplicate);
  await first;
  let d = store.detail(id);
  assert.equal(d.revisions.length, 1);
  assert.equal(d.runs.length, 1);
  assert.throws(() => store.revision(a, "覆盖原始转写", "asr"));
  await service.analyze(a.id, "我校正后的新表达", true);
  d = store.detail(id);
  assert.equal(d.revisions.length, 2);
  assert.equal(d.runs.length, 2);
  assert.notEqual(d.runs[0].revisionId, d.runs[1].revisionId);
  assert.throws(() => store.deleteAttempt(a.id));
  service.open(id, true);
  const second = service.begin("audio/webm");
  service.chunk(second.id, 0, new ArrayBuffer(200));
  service.finish(second.id, 1000, true, true);
  assert.equal(store.detail(id).attempts.length, 2);
  store.db.close();
  store = new Store(root);
  assert.equal(store.detail(id).runs.length, 2);
  const restarted = new TrainingService(store, config);
  assert.equal(restarted.clock.session!.id, id);
  restarted.remove(id);
  assert.equal(store.sessions().length, 0);
  assert.equal(readdirSync(store.audioDir).length, 0);
  for (const table of ["attempts", "revisions", "runs", "jobs", "events"])
    assert.equal(
      (
        store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
          n: number;
        }
      ).n,
      0,
    );
  assert.throws(() => store.saveAttempt(a));
  restarted.start("franklin");
  const newId = restarted.clock.session!.id;
  restarted.clock.command("next", restarted.clock.version);
  restarted.clock.command("next", restarted.clock.version);
  const interrupted = restarted.begin("audio/webm");
  restarted.chunk(interrupted.id, 0, new ArrayBuffer(200));
  restarted.finish(interrupted.id, 500, true, true);
  const file = join(store.audioDir, interrupted.audioPath);
  writeFileSync(file + ".part", new Uint8Array(150));
  store.db.close();
  store = new Store(root);
  assert.equal(store.detail(newId).attempts[0].status, "interrupted");
  assert.equal(existsSync(file + ".part"), false);
  const s = new TrainingService(store, config);
  const pending = s.submit(interrupted.id, true);
  s.remove(newId);
  await pending.catch(() => {});
  assert.equal(store.sessions().length, 0);
  console.log(
    "PASS: Electron ABI SQLite integration: persistence, chunk sequencing, deduplication, immutable ASR, revision links, retell, recovery, cascading deletion and late response rejection.",
  );
}
main()
  .then(() => {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  })
  .catch((e) => {
    console.error(e);
    store.db.close();
    rmSync(root, { recursive: true, force: true });
    process.exitCode = 1;
  });
