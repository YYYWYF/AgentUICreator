// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installCreatorHostPreviewBridge } from "../src/host-preview/hostPreviewClient.js";
import { HOST_PREVIEW_CONNECT } from "../src/host-preview/protocol.js";
const parent = {} as Window;
const originalParent = window.parent;
(window as Window & { __agentUiCreatorHostPreviewDispose?: () => void }).__agentUiCreatorHostPreviewDispose?.();
let dispose: () => void;
function connect(origin: string, referrer: string, source: Window = parent) {
  Object.defineProperty(document, "referrer", { configurable: true, value: referrer });
  const port = { start: vi.fn(), close: vi.fn(), postMessage: vi.fn(), onmessage: null };
  window.dispatchEvent(new MessageEvent("message", { origin, source, ports: [port as unknown as MessagePort], data: {
    type: HOST_PREVIEW_CONNECT, session: { workspaceId: "project", threadId: "thread", creatorOrigin: origin, runtimeDiagnostics: false, visualObservation: false, previewSource: { identity: "mock-source", runtimeEndpoint: "/__agent-ui/mock" } },
  } }));
  return port;
}
beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, "", "/?creator-preview");
  Object.defineProperty(window, "parent", { configurable: true, value: parent });
  dispose = installCreatorHostPreviewBridge();
});
afterEach(() => { dispose(); Object.defineProperty(window, "parent", { configurable: true, value: originalParent }); });
it("authenticates the first parent and reconnects after a Host-origin reload", () => {
  expect(connect("https://creator.test", "https://creator.test/").start).toHaveBeenCalled();
  expect(connect("https://creator.test", window.location.origin + "/?creator-preview").start).toHaveBeenCalled();
});
it("cannot establish trust from a self-referrer or an unrelated source", () => {
  expect(connect("https://other.test", window.location.origin + "/").start).not.toHaveBeenCalled();
  expect(connect("https://creator.test", "https://creator.test/", {} as Window).start).not.toHaveBeenCalled();
});
it("does not reuse trusted parent state for another origin", () => {
  connect("https://creator.test", "https://creator.test/");
  expect(connect("https://other.test", window.location.origin + "/").start).not.toHaveBeenCalled();
});
