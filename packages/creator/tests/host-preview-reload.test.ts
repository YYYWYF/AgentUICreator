// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installCreatorHostPreviewBridge } from "../src/host-preview/hostPreviewClient.js";
import { HOST_DOCK_CONNECT, HOST_PREVIEW_CONNECT } from "../src/host-preview/protocol.js";
const parent = {} as Window;
const originalParent = window.parent;
(window as Window & { __agentUiCreatorHostPreviewDispose?: () => void }).__agentUiCreatorHostPreviewDispose?.();
let dispose: () => void;
function connect(origin: string, referrer: string, source: Window = parent, runtimeDiagnostics = false, previewSource: object = { identity: "mock-source", runtimeEndpoint: "/__agent-ui/mock" }) {
  Object.defineProperty(document, "referrer", { configurable: true, value: referrer });
  const port = { start: vi.fn(), close: vi.fn(), postMessage: vi.fn(), onmessage: null };
  window.dispatchEvent(new MessageEvent("message", { origin, source, ports: [port as unknown as MessagePort], data: {
    type: HOST_PREVIEW_CONNECT, session: { workspaceId: "project", threadId: "thread", creatorOrigin: origin, runtimeDiagnostics, visualObservation: false, previewSource },
  } }));
  return port;
}
beforeEach(() => {
  sessionStorage.clear();
  delete (window as Window & { __agentUIPreviewEnvironment?: unknown }).__agentUIPreviewEnvironment;
  delete (window as Window & { __agentUIPreviewEnvironmentReady?: boolean }).__agentUIPreviewEnvironmentReady;
  window.history.replaceState({}, "", "/?creator-preview");
  Object.defineProperty(window, "parent", { configurable: true, value: parent });
  dispose = installCreatorHostPreviewBridge();
});
afterEach(() => { dispose(); document.getElementById("agent-ui-creator-dock")?.remove(); Object.defineProperty(window, "parent", { configurable: true, value: originalParent }); });
it("authenticates the first parent and reconnects after a Host-origin reload", () => {
  expect(connect("https://creator.test", "https://creator.test/").start).toHaveBeenCalled();
  expect(connect("https://creator.test", window.location.origin + "/?creator-preview").start).toHaveBeenCalled();
});
it("reports the current business page URL only over its authenticated port", () => {
  const rejected = connect("https://other.test", window.location.origin + "/");
  expect(rejected.onmessage).toBeNull();
  const port = connect("https://creator.test", "https://creator.test/");
  window.history.replaceState({}, "", "/orders/page?creator-preview");
  (port.onmessage as unknown as (event: unknown) => void)({ data: { type: "business-page-url-request", requestId: "request" } });
  expect(port.postMessage).toHaveBeenCalledWith({ type: "business-page-url", requestId: "request", pageUrl: window.location.href });
});
it("cannot establish trust from a self-referrer or an unrelated source", () => {
  expect(connect("https://other.test", window.location.origin + "/").start).not.toHaveBeenCalled();
  expect(connect("https://creator.test", "https://creator.test/", {} as Window).start).not.toHaveBeenCalled();
});
it("does not reuse trusted parent state for another origin", () => {
  connect("https://creator.test", "https://creator.test/");
  expect(connect("https://other.test", window.location.origin + "/").start).not.toHaveBeenCalled();
});
it("clears the temporary source only on the authenticated port when idle, then permits re-enabling", () => {
  const target = window as Window & { __agentUIPreviewEnvironment?: unknown; __agentUIPreviewEnvironmentReady?: boolean };
  const port = connect("https://creator.test", "https://creator.test/");
  const changed = vi.fn(); window.addEventListener("agent-ui:preview-environment", changed);
  const update = (source: object) => (port.onmessage as unknown as (event: unknown) => void)({ data: { type: "preview-source", source } });
  try {
    window.dispatchEvent(new CustomEvent("agent-ui:preview-run-state", { detail: { running: true } }));
    update({ type: "application" });
    expect(target.__agentUIPreviewEnvironment).toMatchObject({ identity: "mock-source" });
    expect(changed).not.toHaveBeenCalled();
    window.dispatchEvent(new CustomEvent("agent-ui:preview-run-state", { detail: { running: false } }));
    update({ type: "application" });
    expect(target.__agentUIPreviewEnvironment).toBeUndefined();
    expect(target.__agentUIPreviewEnvironmentReady).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    update({ type: "mock", identity: "mock-source", runtimeEndpoint: "/__agent-ui/mock" });
    expect(target.__agentUIPreviewEnvironment).toMatchObject({ identity: "mock-source" });
    expect(changed).toHaveBeenCalledTimes(2);
  } finally { window.removeEventListener("agent-ui:preview-environment", changed); }
});
it("marks an initially disabled connection ready without applying a temporary source", () => {
  connect("https://creator.test", "https://creator.test/", parent, false, { type: "application" });
  const target = window as Window & { __agentUIPreviewEnvironment?: unknown; __agentUIPreviewEnvironmentReady?: boolean };
  expect(target.__agentUIPreviewEnvironment).toBeUndefined();
  expect(target.__agentUIPreviewEnvironmentReady).toBe(true);
});
it("collects a correlated observation only through the current authenticated runtime-enabled port", () => {
  const hash = "a".repeat(64), requestId = "12345678-1234-1234-1234-123456789abc";
  const port = connect("https://creator.test", "https://creator.test/", parent, true);
  const send = (threadId: string) => (port.onmessage as unknown as (event: unknown) => void)({ data: {
    type: "runtime-observation-request", request: { threadId, currentHash: hash, requestId },
  } });
  const collect = vi.fn(() => window.dispatchEvent(new CustomEvent("agent-ui:observation", { detail: {
    type: "runtime-composition", composition: { appUIModelHash: hash, observedAt: new Date().toISOString() },
  } })));
  window.addEventListener("agent-ui:observation-request", collect);
  try {
    send("wrong-thread"); expect(collect).not.toHaveBeenCalled();
    send("thread"); expect(collect).toHaveBeenCalledTimes(1);
    const upload = port.postMessage.mock.calls.map(call => call[0]).find(call => typeof call.body === "string");
    expect(JSON.parse(upload.body)).toMatchObject({ threadId: "thread", observationRequestId: requestId });
    collect();
    const replay = port.postMessage.mock.calls.at(-1)![0];
    expect(JSON.parse(replay.body).observationRequestId).toBeUndefined();
  } finally { window.removeEventListener("agent-ui:observation-request", collect); }
});
it("does not consume a fresh-capture request when the Host replays a cached observation first", () => {
  const hash = "a".repeat(64), requestId = "12345678-1234-1234-1234-123456789abc";
  const port = connect("https://creator.test", "https://creator.test/", parent, true);
  const publish = (observedAt: string) => window.dispatchEvent(new CustomEvent("agent-ui:observation", { detail: {
    type: "runtime-composition", composition: { appUIModelHash: hash, observedAt },
  } }));
  const old = new Date(Date.now() - 1000).toISOString(); publish(old);
  const replay = () => publish(old);
  window.addEventListener("agent-ui:observation-request", replay);
  try {
    (port.onmessage as unknown as (event: unknown) => void)({ data: { type: "runtime-observation-request", request: { threadId: "thread", currentHash: hash, requestId } } });
    expect(JSON.parse(port.postMessage.mock.calls.at(-1)![0].body).observationRequestId).toBeUndefined();
    publish(new Date().toISOString());
    expect(JSON.parse(port.postMessage.mock.calls.at(-1)![0].body).observationRequestId).toBe(requestId);
  } finally { window.removeEventListener("agent-ui:observation-request", replay); }
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
