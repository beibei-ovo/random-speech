import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  protocol,
  net,
  Tray,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  dialog,
  safeStorage,
} from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { Store } from "./store";
import { TrainingService } from "./service";
import {
  settingsSchema,
  audioSummarySchema,
  type ServiceConfig,
} from "../shared/types";
import { localAsset, audioRange } from "./security";
import topics from "../../resources/topics.json";
protocol.registerSchemesAsPrivileged([
  {
    scheme: "speech",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
if (process.env.SPEECH_TEST_DATA && !app.isPackaged)
  app.setPath("userData", process.env.SPEECH_TEST_DATA);
if (process.env.SPEECH_TEST_AUDIO === "1" && !app.isPackaged) {
  app.commandLine.appendSwitch("use-fake-device-for-media-stream");
  app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
}
app.setAppUserModelId("com.randomspeech.trainer");
let main: BrowserWindow;
let floating: BrowserWindow;
let tray: Tray;
let service: TrainingService;
let quitting = false;
let permitUntil = 0;
const defaultService = (
  kind: "transcription" | "feedback",
): Omit<ServiceConfig, "credentialRef"> => ({
  providerName: "OpenAI（或自行配置的兼容服务）",
  adapterId: kind === "transcription" ? "multipart-asr-v1" : "chat-json-v1",
  baseUrl: "https://api.openai.com/v1",
  model: kind === "transcription" ? "whisper-1" : "gpt-4o-mini",
  recipient: "OpenAI（或自行配置的兼容服务）",
  retention: "留存期限待向所选服务商确认；请勿提交敏感信息。",
  adapterVersion: "v1",
});
const defaults = {
  mode: "demo" as const,
  transcription: { ...defaultService("transcription"), credentialRef: "transcription" },
  feedback: { ...defaultService("feedback"), credentialRef: "feedback" },
  reuseTranscriptionConnection: false,
};
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    main?.show();
    main?.focus();
  });
  app.whenReady().then(async () => {
    const store = new Store(join(app.getPath("userData"), "training"));
    const rawConfig = (() => {
      try {
        return JSON.parse(store.setting("config") || "{}");
      } catch {
        return {};
      }
    })();
    const oldConfig = rawConfig as Record<string, unknown>;
    const oldService = {
      ...defaultService("transcription"),
      credentialRef: "transcription",
      ...(typeof oldConfig.baseUrl === "string" ? { baseUrl: oldConfig.baseUrl } : {}),
      ...(typeof oldConfig.providerName === "string" ? { providerName: oldConfig.providerName, recipient: oldConfig.providerName } : {}),
      ...(typeof oldConfig.retention === "string" ? { retention: oldConfig.retention } : {}),
      ...(typeof oldConfig.asrModel === "string" ? { model: oldConfig.asrModel } : {}),
    };
    const oldFeedback = {
      ...defaultService("feedback"),
      credentialRef: "feedback",
      ...(typeof oldConfig.baseUrl === "string" ? { baseUrl: oldConfig.baseUrl } : {}),
      ...(typeof oldConfig.providerName === "string" ? { providerName: oldConfig.providerName, recipient: oldConfig.providerName } : {}),
      ...(typeof oldConfig.retention === "string" ? { retention: oldConfig.retention } : {}),
      ...(typeof oldConfig.feedbackModel === "string" ? { model: oldConfig.feedbackModel } : {}),
    };
    let config = settingsSchema.parse({
      mode: oldConfig.mode === "cloud" ? "cloud" : "demo",
      transcription: { ...oldService, ...(typeof oldConfig.transcription === "object" ? oldConfig.transcription : {}) },
      feedback: { ...oldFeedback, ...(typeof oldConfig.feedback === "object" ? oldConfig.feedback : {}) },
      reuseTranscriptionConnection: oldConfig.reuseTranscriptionConnection === true,
    });
    const decrypt = (value: string | undefined) => {
      try {
        return safeStorage.isEncryptionAvailable() && value
          ? safeStorage.decryptString(Buffer.from(value, "base64"))
          : "";
      } catch {
        return "";
      }
    };
    const legacyKey = decrypt(store.setting("key"));
    let transcriptionKey = decrypt(store.setting("key:transcription")) || legacyKey;
    let feedbackKey = decrypt(store.setting("key:feedback")) || legacyKey;
    const settings = () => ({
      ...config,
      transcriptionHasKey: !!transcriptionKey,
      feedbackHasKey: !!feedbackKey,
      hasKey: !!(transcriptionKey || feedbackKey),
      persistentKey: safeStorage.isEncryptionAvailable(),
    });
    service = new TrainingService(store, () => ({
      ...config,
      transcription: { ...config.transcription, key: transcriptionKey },
      feedback: { ...config.feedback, key: feedbackKey },
      key: transcriptionKey,
    }));
    const renderer = join(__dirname, "../renderer");
    protocol.handle("speech", async (request) => {
      try {
        const url = new URL(request.url);
        if (url.host === "audio") {
          const id = z.uuid().parse(url.pathname.slice(1));
          const a = store.attempt(id);
          const bytes = readFileSync(join(store.audioDir, a.audioPath));
          let range;
          try {
            range = audioRange(request.headers.get("range"), bytes.length);
          } catch {
            return new Response(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${bytes.length}` },
            });
          }
          const headers = {
            "Content-Type": a.mime,
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "speech://app",
            "Cache-Control": "no-store",
          };
          return range
            ? new Response(bytes.subarray(range.start, range.end + 1), {
                status: 206,
                headers: {
                  ...headers,
                  "Content-Range": `bytes ${range.start}-${range.end}/${bytes.length}`,
                  "Content-Length": String(range.end - range.start + 1),
                },
              })
            : new Response(bytes, { headers });
        }
        if (url.host !== "app") return new Response(null, { status: 403 });
        return net.fetch(
          pathToFileURL(localAsset(renderer, url.pathname)).toString(),
        );
      } catch {
        return new Response(null, { status: 404 });
      }
    });
    const trusted = (url: string) => {
      try {
        const parsed = new URL(url);
        return (
          parsed.origin ===
            new URL(process.env.ELECTRON_RENDERER_URL || "speech://app")
              .origin &&
          (process.env.ELECTRON_RENDERER_URL
            ? parsed.origin !== "null"
            : parsed.protocol === "speech:" && parsed.host === "app")
        );
      } catch {
        return false;
      }
    };
    session.defaultSession.setPermissionCheckHandler(
      (contents, permission, _origin, details) =>
        contents === main?.webContents &&
        permission === "media" &&
        Date.now() < permitUntil &&
        trusted(details.requestingUrl || "") &&
        details.mediaType === "audio",
    );
    session.defaultSession.setPermissionRequestHandler(
      (contents, permission, callback, details) =>
        callback(
          contents === main?.webContents &&
            permission === "media" &&
            Date.now() < permitUntil &&
            trusted(details.requestingUrl) &&
            "mediaTypes" in details &&
            details.mediaTypes?.every((t: string) => t === "audio") === true,
        ),
    );
    function windowOptions(preload: string) {
      return {
        preload: join(__dirname, "../preload", preload),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      };
    }
    main = new BrowserWindow({
      width: 1200,
      height: 820,
      minWidth: 720,
      minHeight: 600,
      show: false,
      backgroundColor: "#f5f7f8",
      title: "随机演讲训练器",
      autoHideMenuBar: true,
      webPreferences: windowOptions("index.js"),
    });
    const area = screen.getPrimaryDisplay().workArea;
    let pos = { x: area.x + area.width - 344, y: area.y + 80 };
    try {
      const saved = JSON.parse(store.setting("floatingPosition") || "null");
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        const display = screen.getDisplayNearestPoint(saved).workArea;
        pos = {
          x: Math.max(
            display.x,
            Math.min(saved.x, display.x + display.width - 320),
          ),
          y: Math.max(
            display.y,
            Math.min(saved.y, display.y + display.height - 216),
          ),
        };
      }
    } catch {
      /* Default visible position. */
    }
    floating = new BrowserWindow({
      ...pos,
      width: 320,
      height: 216,
      show: false,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: "#ffffff",
      webPreferences: windowOptions("floating.js"),
    });
    floating.on("moved", () => {
      const [x, y] = floating.getPosition();
      store.setSetting("floatingPosition", JSON.stringify({ x, y }));
    });
    for (const window of [main, floating]) {
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (e) => e.preventDefault());
      window.webContents.on("will-attach-webview", (e) => e.preventDefault());
    }
    const url = process.env.ELECTRON_RENDERER_URL || "speech://app/index.html";
    const icon = nativeImage.createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFElEQVQ4T2Nk+M/wn4ECwESJ5lEDADc/Ah8oK4jEAAAAAElFTkSuQmCC",
    );
    tray = new Tray(icon);
    tray.setToolTip("随机演讲训练器");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "打开训练器",
          click: () => {
            main.show();
            main.focus();
          },
        },
        { label: "显示悬浮计时", click: () => floating.showInactive() },
        { type: "separator" },
        { label: "退出", click: () => app.quit() },
      ]),
    );
    tray.on("double-click", () => main.show());
    main.on("close", (e) => {
      if (!quitting && service.clock.session) {
        e.preventDefault();
        main.hide();
        if (!store.setting("closeExplained")) {
          store.setSetting("closeExplained", "1");
          tray.displayBalloon({
            title: "训练仍在进行",
            content:
              "主窗口已隐藏到托盘，计时和录音会继续。可从托盘恢复或退出。",
          });
        }
      }
    });
    floating.on("close", (e) => {
      if (!quitting) {
        e.preventDefault();
        floating.hide();
      }
    });
    service.onChange = (s) => {
      for (const w of [main, floating])
        if (!w.isDestroyed()) w.webContents.send("snapshot", s);
      main.webContents.setBackgroundThrottling(
        !s.recordingId && (!s.session || s.session.phase === "ready"),
      );
    };
    service.onStop = () => {
      service.clock.notice = "录音需要结束";
      service.emit(false);
    };
    ipcMain.handle(
      "business",
      async (event, method: string, raw: unknown[]) => {
        const isMain = event.sender === main.webContents;
        const isFloating = event.sender === floating.webContents;
        if (
          (!isMain && !isFloating) ||
          event.senderFrame !== event.sender.mainFrame ||
          !trusted(event.senderFrame?.url || "")
        )
          throw new Error("不可信的调用来源。");
        if (
          isFloating &&
          !["snapshot", "pause", "resume", "showMain", "floating"].includes(
            method,
          )
        )
          throw new Error("悬浮窗没有此权限。");
        const args = z.array(z.unknown()).max(5).parse(raw);
        const id = () => z.uuid().parse(args[0]);
        const version = () => z.number().int().nonnegative().parse(args[0]);
        switch (method) {
          case "snapshot":
            return service.snapshot();
          case "topics":
            return topics;
          case "start": {
            const s = service.start(z.string().max(100).parse(args[0]));
            floating.showInactive();
            return s;
          }
          case "pause":
          case "resume":
          case "next":
            service.clock.command(method, version());
            return service.emit();
          case "outline":
            service.outline(id(), z.string().max(20000).parse(args[1]));
            return;
          case "history":
            return store.sessions().map((s) => {
              const d = store.detail(s.id);
              return {
                ...s,
                count: d.attempts.length,
                bytes: d.attempts.reduce((n, a) => n + a.bytes, 0),
                completed: d.runs.length > 0,
              };
            });
          case "detail":
            return store.detail(id());
          case "remove":
            return service.remove(id());
          case "openSession":
            return service.open(id());
          case "retell":
            return service.open(id(), true);
          case "permitMicrophone":
            if (service.clock.session?.phase !== "ready" || service.recording)
              throw new Error("当前不能录音。");
            permitUntil = Date.now() + 60000;
            return;
          case "begin":
            if (Date.now() >= permitUntil) throw new Error("请重新点击录音。");
            return service.begin(
              z.enum(["audio/webm;codecs=opus", "audio/webm"]).parse(args[0]),
            );
          case "recordingStarted":
            return service.started(id());
          case "chunk": {
            const data = z
              .instanceof(ArrayBuffer)
              .refine(
                (b) => b.byteLength > 0 && b.byteLength <= 4 * 1024 * 1024,
              )
              .parse(args[2]);
            return service.chunk(
              id(),
              z.number().int().nonnegative().parse(args[1]),
              data,
            );
          }
          case "finish":
            permitUntil = 0;
            return service.finish(
              id(),
              z.number().min(0).max(3600000).parse(args[1]),
              z.boolean().parse(args[2]),
              z.boolean().parse(args[3]),
              args[4] === undefined
                ? undefined
                : audioSummarySchema.parse(args[4]),
            );
          case "discard":
            return service.discard(id());
          case "submit":
            return service.submit(id(), z.boolean().parse(args[1]));
          case "analyze":
            return service.analyze(
              id(),
              z.string().trim().min(1).max(30000).parse(args[1]),
              z.boolean().parse(args[2]),
            );
          case "helpful": {
            const runId = id();
            const row = store.db
              .prepare("SELECT data FROM runs WHERE id=?")
              .get(runId) as { data: string } | undefined;
            if (!row) throw new Error("反馈不存在。");
            const run = JSON.parse(row.data);
            run.helpful = z.boolean().parse(args[1]);
            store.run(run);
            return;
          }
          case "settings":
            return settings();
          case "saveSettings": {
            if (service.tasks.size)
              throw new Error("请等待当前分析完成后更改服务。");
            const input = settingsSchema
              .extend({
                transcriptionKey: z.string().max(2000).optional(),
                feedbackKey: z.string().max(2000).optional(),
                key: z.string().max(2000).optional(),
              })
              .parse(args[0]);
            const {
              transcriptionKey: newTranscriptionKey,
              feedbackKey: newFeedbackKey,
              key: legacyNewKey,
              ...next
            } = input;
            config = next;
            const encrypt = (value: string | undefined) =>
              safeStorage.isEncryptionAvailable() && value
                ? safeStorage.encryptString(value).toString("base64")
                : "";
            if (newTranscriptionKey !== undefined)
              transcriptionKey = newTranscriptionKey;
            if (newFeedbackKey !== undefined) feedbackKey = newFeedbackKey;
            if (legacyNewKey !== undefined) {
              transcriptionKey = legacyNewKey;
              feedbackKey = legacyNewKey;
            }
            if (
              newTranscriptionKey !== undefined ||
              legacyNewKey !== undefined
            )
              store.setSetting("key:transcription", encrypt(transcriptionKey));
            if (newFeedbackKey !== undefined || legacyNewKey !== undefined)
              store.setSetting("key:feedback", encrypt(feedbackKey));
            store.setSetting("config", JSON.stringify(config));
            return settings();
          }
          case "floating":
            if (z.boolean().parse(args[0])) floating.showInactive();
            else floating.hide();
            return;
          case "showMain":
            main.show();
            main.focus();
            return;
          default:
            throw new Error("未知命令。");
        }
      },
    );
    await main.loadURL(url);
    await floating.loadURL(url + "#/floating");
    main.show();
    const interval = setInterval(() => service.tick(), 250);
    powerMonitor.on("suspend", () => service.suspend());
    main.webContents.on("render-process-gone", () => {
      service.suspend();
      if (service.recording) {
        const r = service.recording;
        service.finish(
          r.id,
          r.start === null ? 0 : performance.now() - r.start,
          false,
          true,
        );
      }
    });
    app.on("before-quit", (e) => {
      if (quitting) return;
      if (service.clock.session || service.tasks.size) {
        e.preventDefault();
        const answer = dialog.showMessageBoxSync(main, {
          type: "question",
          title: "退出训练器",
          message: "退出并保留当前训练？",
          detail:
            "准备计时将暂停；服务任务停止后可重试，已发送的请求可能产生费用。",
          buttons: ["继续训练", "保存并退出"],
          defaultId: 0,
          cancelId: 0,
        });
        if (answer !== 1) return;
        service.suspend();
        for (const task of service.tasks.values()) task.controller.abort();
        const finishQuit = () => {
          quitting = true;
          clearInterval(interval);
          service.emit();
          store.db.close();
          app.quit();
        };
        if (service.recording) {
          const deadline = Date.now() + 5000;
          const wait = setInterval(() => {
            if (!service.recording || Date.now() > deadline) {
              clearInterval(wait);
              if (service.recording) {
                const r = service.recording;
                service.finish(
                  r.id,
                  r.start === null ? 0 : performance.now() - r.start,
                  false,
                  true,
                );
              }
              finishQuit();
            }
          }, 100);
        } else finishQuit();
      } else {
        quitting = true;
        clearInterval(interval);
        store.db.close();
      }
    });
  });
  app.on("window-all-closed", () => {
    if (!service?.clock.session) app.quit();
  });
}
