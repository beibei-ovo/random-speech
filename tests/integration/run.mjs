import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
await build({
  entryPoints: ["tests/integration/storage.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "out/integration.cjs",
  external: ["better-sqlite3"],
});
const result = spawnSync(require("electron"), ["out/integration.cjs"], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: "inherit",
});
process.exit(result.status ?? 1);
