// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installCreatorHostPreviewBridge } from "../src/host-preview/hostPreviewClient.js";
import { HOST_DOCK_CONNECT, HOST_PREVIEW_CONNECT } from "../src/host-preview/protocol.js";
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
afterEach(() => { dispose(); document.getElementById("agent-ui-creator-dock")?.remove(); Object.defineProperty(window, "parent", { configurable: true, value: originalParent }); });
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
it("accepts the configured dock iframe and rejects unrelated windows and origins", () => {
  window.history.replaceState({}, "", "/");
  const host = document.createElement("div");
  host.id = "agent-ui-creator-dock";
  const shadow = host.attachShadow({ mode: "open" });
  const frame = document.createElement("iframe");
  frame.id = "agent-ui-creator-frame";
  frame.src = "https://creator.test/dock.html";
  shadow.append(frame); document.body.append(host);
  const dockWindow = {} as Window;
  Object.defineProperty(frame, "contentWindow", { value: dockWindow });
  function send(source: Window, origin: string) {
    const port = { start: vi.fn(), close: vi.fn(), postMessage: vi.fn(), onmessage: null };
    window.dispatchEvent(new MessageEvent("message", { source, origin, ports: [port as unknown as MessagePort], data: {
      type: HOST_DOCK_CONNECT, session: { workspaceId: "project", threadId: "thread", creatorOrigin: origin, runtimeDiagnostics: false, visualObservation: false, previewSource: { identity: "connected-source", runtimeEndpoint: "/__agent-ui/agent-proxy/run" } },
    } }));
    return port;
  }
  expect(send(parent, "https://creator.test").start).not.toHaveBeenCalled();
  expect(send(dockWindow, "https://other.test").start).not.toHaveBeenCalled();
  expect(send(dockWindow, "https://creator.test").start).toHaveBeenCalled();
  expect((window as Window & { __agentUIPreviewEnvironment?: unknown }).__agentUIPreviewEnvironment).toMatchObject({ identity: "connected-source", runtimeEndpoint: "/__agent-ui/agent-proxy/run" });
});
