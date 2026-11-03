// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { connectCreatorHostPreview } from "../src/host-preview/hostPreviewWorkbench.js";
import { CREATOR_OBSERVATION_REQUEST_EVENT } from "../src/host-preview/protocol.js";
import { agentContracts } from "../src/agent/contracts.js";
import path from "node:path";

afterEach(() => vi.unstubAllGlobals());
it("forwards only current workspace/thread requests over the selected preview port and removes its listener on dispose", async () => {
  const ports: any[] = [];
  class Channel {
    port1 = { onmessage: null, start: vi.fn(), close: vi.fn(), postMessage: vi.fn() };
    port2 = {};
    constructor() { ports.push(this.port1); }
  }
  vi.stubGlobal("MessageChannel", Channel);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ enabled: false }) })));
  const frame = document.createElement("iframe"); frame.src = "https://host.test/";
  Object.defineProperty(frame, "contentWindow", { value: { postMessage: vi.fn() } });
  const dispose = connectCreatorHostPreview(frame, { threadId: "thread", workspaceId: "workspace", runtimeDiagnostics: true, visualObservation: false });
  await vi.waitFor(() => expect((frame.contentWindow!.postMessage as any)).toHaveBeenCalled());
  const request = { threadId: "thread", workspaceId: "workspace", requestId: "12345678-1234-1234-1234-123456789abc", currentHash: "a".repeat(64) };
  const send = (detail: unknown) => window.dispatchEvent(new CustomEvent(CREATOR_OBSERVATION_REQUEST_EVENT, { detail }));
  send({ ...request, workspaceId: "other" }); send({ ...request, threadId: "other" }); send({ ...request, requestId: "script()" });
  expect(ports[0].postMessage).not.toHaveBeenCalled();
  send(request);
  expect(ports[0].postMessage).toHaveBeenCalledExactlyOnceWith({ type: "runtime-observation-request", request });
  dispose(); send(request);
  expect(ports[0].postMessage).toHaveBeenCalledTimes(1);
  expect(ports[0].close).toHaveBeenCalled();
});
it("accepts a bounded correlation identity without accepting arbitrary envelope fields", async () => {
  const contracts = await agentContracts(path.resolve("contracts/creator"));
  const envelope = { threadId: "thread", observationRequestId: "12345678-1234-1234-1234-123456789abc" };
  expect(() => contracts.validate("RuntimeDiagnosticEnvelope", envelope)).not.toThrow();
  expect(() => contracts.validate("RuntimeDiagnosticEnvelope", { ...envelope, observationRequestId: "arbitrary-script" })).toThrow();
  expect(() => contracts.validate("RuntimeDiagnosticEnvelope", { ...envelope, evaluate: "alert(1)" })).toThrow();
});
