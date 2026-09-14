// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../src/renderer/src/App";
import topics from "../../resources/topics.json";
it("shows Chinese topic picker and starts only on explicit locking", async () => {
  const start = vi.fn().mockResolvedValue({});
  const snapshot = {
    version: 0,
    session: null,
    recordingId: null,
    recordingRemainingMs: 0,
    notice: null,
  };
  Object.assign(window, {
    api: {
      topics: async () => [topics[0]],
      history: async () => [],
      snapshot: async () => snapshot,
      subscribe: () => () => {},
      start,
    },
  });
  Object.assign(globalThis, {
    AudioContext: class {
      resume() {
        return Promise.resolve();
      }
    },
  });
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  await screen.findByText(topics[0].title);
  expect(start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("锁定主题，开始练习"));
  await waitFor(() => expect(start).toHaveBeenCalledWith(topics[0].id));
});
