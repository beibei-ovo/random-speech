import { create } from "zustand";
import type { Snapshot } from "../../shared/types";
export const useTraining = create<{
  snapshot: Snapshot;
  update: (s: Snapshot) => void;
}>((set) => ({
  snapshot: {
    version: 0,
    session: null,
    recordingId: null,
    recordingRemainingMs: 0,
    notice: null,
  },
  update: (snapshot) =>
    set((previous) =>
      snapshot.version >= previous.snapshot.version ? { snapshot } : previous,
    ),
}));
export const time = (ms: number) =>
  `${Math.floor(Math.ceil(ms / 1000) / 60)
    .toString()
    .padStart(
      2,
      "0",
    )}:${(Math.ceil(ms / 1000) % 60).toString().padStart(2, "0")}`;
