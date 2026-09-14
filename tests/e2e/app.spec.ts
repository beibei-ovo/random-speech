import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("desktop workflow: timer, real MediaRecorder, demo feedback, corrections, retell and deletion", async () => {
  const root = await mkdtemp(join(tmpdir(), "speech-e2e-"));
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, SPEECH_TEST_DATA: root, SPEECH_TEST_AUDIO: "1" },
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(page.getByText("今天，把一个新知识")).toBeVisible();
    await page.screenshot({ path: "test-results/home.png", fullPage: true });
    await page.getByText("锁定主题，开始练习").click();
    await expect(page.getByText("10:00", { exact: true })).toBeVisible();
    await page.getByText("暂停一下").click();
    const remaining = await page.evaluate(() => window.api.snapshot());
    await page.waitForTimeout(1100);
    expect(
      (await page.evaluate(() => window.api.snapshot())).session!.remainingMs,
    ).toBe(remaining.session!.remainingMs);
    await page.getByLabel("知识提纲").fill("先定义概念，再举一个生活例子。");
    await page.getByText("我准备好了，进入下一步").click();
    await expect(page.getByText("05:00", { exact: true })).toBeVisible();
    await page.getByText("我准备好了，进入下一步").click();
    await expect(page.getByText("开始 2 分钟演讲")).toBeVisible();
    expect(
      (await page.evaluate(() => window.api.snapshot())).recordingId,
    ).toBeNull();
    const windows = app.windows();
    expect(windows.length).toBe(2);
    const floating = windows.find((w) => w !== page)!;
    await expect(floating.getByText("等待录音", { exact: true })).toBeVisible();
    const blocked = await app.evaluate(async ({ BrowserWindow }) => {
      const float = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("floating"),
      )!;
      return float.webContents.executeJavaScript(`typeof window.api.submit`);
    });
    expect(blocked).toBe("undefined");
    await page.getByText("开始 2 分钟演讲").click();
    await expect(page.getByText("结束录音", { exact: true })).toBeVisible();
    await page.waitForTimeout(2300);
    await page.getByText("结束录音", { exact: true }).click();
    await expect(page.getByText("回放确认与提交")).toBeEnabled();
    await page.getByText("回放确认与提交").click();
    await page.getByRole("checkbox").check();
    await page.getByText("确认提交，获取反馈").click();
    await expect(page.getByText("表达反馈", { exact: true })).toBeVisible();
    await expect(
      page.getByText("离线演示反馈：", { exact: false }),
    ).toBeVisible();
    const original = await page.getByLabel("演讲转写").inputValue();
    await page
      .getByLabel("演讲转写")
      .fill(original + " 我补充了一个具体例子。");
    await page.getByText("保存校正并重新分析").click();
    await expect(page.getByLabel("转写版本").locator("option")).toHaveCount(2);
    await page.screenshot({
      path: "test-results/feedback.png",
      fullPage: true,
    });
    const history = await page.evaluate(() => window.api.history());
    expect(history).toHaveLength(1);
    const detail = await page.evaluate(
      (id) => window.api.detail(id),
      history[0].id,
    );
    expect(detail.revisions).toHaveLength(2);
    expect(detail.revisions[0].text).toBe(original);
    expect(detail.runs).toHaveLength(2);
    expect(detail.attempts[0].outline).toContain("生活例子");
    await page.getByText("补充提纲 · 同题再讲").click();
    await expect(page.getByText("开始 2 分钟演讲")).toBeVisible();
    await page.getByText("开始 2 分钟演讲").click();
    await expect(page.getByText("结束录音", { exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    await page.getByText("结束录音", { exact: true }).click();
    await expect(page.getByText("回放确认与提交")).toBeEnabled();
    const after = await page.evaluate(
      (id) => window.api.detail(id),
      history[0].id,
    );
    expect(after.attempts).toHaveLength(2);
    expect(after.runs).toHaveLength(2);
    await page.getByRole("link", { name: "训练记录" }).click();
    await page.getByRole("button", { name: /删除/ }).click();
    await page.getByText("确认删除", { exact: true }).click();
    await expect(page.getByText("你的第一条练习记录，正在等你")).toBeVisible();
    expect(await readdir(join(root, "training", "audio"))).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
