import { _electron as electron } from "@playwright/test";
import { stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const exe = resolve("release/win-unpacked/随机演讲训练器.exe");
const start = performance.now();
const instance = await electron.launch({ executablePath: exe, args: [] });
try {
  await instance.firstWindow();
  let page = instance
    .windows()
    .find(
      (w) =>
        w.url().startsWith("speech://app/") && !w.url().includes("floating"),
    );
  for (let i = 0; !page && i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    page = instance
      .windows()
      .find(
        (w) =>
          w.url().startsWith("speech://app/") && !w.url().includes("floating"),
      );
  }
  if (!page) throw new Error("Packaged main window did not load");
  await page.getByText("锁定主题，开始练习").waitFor();
  const coldStartMs = Math.round(performance.now() - start);
  const history = await page.evaluate(() => window.api.history());
  if (!Array.isArray(history)) throw new Error("Packaged SQLite access failed");
  const metrics = await instance.evaluate(({ app, BrowserWindow }) => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
    processes: app.getAppMetrics(),
    windows: BrowserWindow.getAllWindows().map((w) => ({
      alwaysOnTop: w.isAlwaysOnTop(),
      sandbox: w.webContents.getLastWebPreferences().sandbox,
      contextIsolation: w.webContents.getLastWebPreferences().contextIsolation,
    })),
  }));
  if (
    !metrics.packaged ||
    metrics.windows.length !== 2 ||
    !metrics.windows.every((w) => w.sandbox && w.contextIsolation) ||
    !metrics.windows.some((w) => w.alwaysOnTop)
  )
    throw new Error("Packaged window configuration invalid");
  const installer = await stat("release/随机演讲训练器 Setup 0.1.0.exe");
  await page.screenshot({ path: "release/preview.png", fullPage: true });
  await writeFile(
    "release/validation.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        coldStartMs,
        installerBytes: installer.size,
        ...metrics,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: packaged app, SQLite, sandboxed main/floating windows; cold start ${coldStartMs} ms; installer ${(installer.size / 1024 / 1024).toFixed(1)} MB.`,
  );
} finally {
  await instance.close();
}
