import { contextBridge, ipcRenderer } from "electron";
const invoke = (method: string, ...args: unknown[]) =>
  ipcRenderer.invoke("business", method, args);
const methods = [
  "snapshot",
  "topics",
  "start",
  "pause",
  "resume",
  "next",
  "outline",
  "history",
  "detail",
  "remove",
  "openSession",
  "retell",
  "permitMicrophone",
  "begin",
  "recordingStarted",
  "chunk",
  "finish",
  "discard",
  "submit",
  "analyze",
  "helpful",
  "settings",
  "saveSettings",
  "floating",
  "showMain",
];
contextBridge.exposeInMainWorld("api", {
  ...Object.fromEntries(
    methods.map((m) => [m, (...args: unknown[]) => invoke(m, ...args)]),
  ),
  subscribe: (fn: (value: unknown) => void) => {
    const handler = (_: unknown, value: unknown) => fn(value);
    ipcRenderer.on("snapshot", handler);
    return () => ipcRenderer.removeListener("snapshot", handler);
  },
});
