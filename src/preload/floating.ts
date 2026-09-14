import { contextBridge, ipcRenderer } from "electron";
const methods = ["snapshot", "pause", "resume", "showMain", "floating"];
contextBridge.exposeInMainWorld("api", {
  ...Object.fromEntries(
    methods.map((m) => [
      m,
      (...args: unknown[]) => ipcRenderer.invoke("business", m, args),
    ]),
  ),
  subscribe: (fn: (value: unknown) => void) => {
    const handler = (_: unknown, value: unknown) => fn(value);
    ipcRenderer.on("snapshot", handler);
    return () => ipcRenderer.removeListener("snapshot", handler);
  },
});
