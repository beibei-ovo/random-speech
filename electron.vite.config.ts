import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: "src/preload/index.ts",
          floating: "src/preload/floating.ts",
        },
      },
    },
  },
  renderer: { plugins: [react()] },
});
