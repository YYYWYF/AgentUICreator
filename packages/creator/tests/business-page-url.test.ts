// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { connectCreatorHostPreview } from "../src/host-preview/hostPreviewWorkbench.js";
import { requestBusinessPageUrl } from "../src/host-preview/businessPageUrl.js";
import { CREATOR_BUSINESS_PAGE_REQUEST } from "../src/host-preview/protocol.js";

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });

async function bridge() {
  const port = { onmessage: null as null | ((event: { data: unknown }) => void), start: vi.fn(), close: vi.fn(), postMessage: vi.fn() };
  vi.stubGlobal("MessageChannel", class { port1 = port; port2 = {}; });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ enabled: false }) })));
  const frame = document.createElement("iframe"); frame.src = "https://business.test/orders/";
  const postMessage = vi.fn(); Object.defineProperty(frame, "contentWindow", { value: { postMessage } });
  dispose = connectCreatorHostPreview(frame, { threadId: "thread", workspaceId: "workspace", runtimeDiagnostics: false, visualObservation: false });
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalled());
  return port;
}

it("obtains the current business URL on the selected workspace's authenticated port", async () => {
  const port = await bridge();
  const result = requestBusinessPageUrl("workspace");
  const message = port.postMessage.mock.calls.at(-1)![0];
  expect(message).toMatchObject({ type: "business-page-url-request" });
  port.onmessage!({ data: { type: "business-page-url", requestId: message.requestId, pageUrl: "https://business.test/updated/orders/" } });
  expect(await result).toBe("https://business.test/updated/orders/");
});

it("does not use an unsolicited, wrong-origin or stale workspace reply as the base", async () => {
  const port = await bridge();
  vi.useFakeTimers();
  const result = requestBusinessPageUrl("workspace");
  const message = port.postMessage.mock.calls.at(-1)![0];
  port.onmessage!({ data: { type: "business-page-url", requestId: "unrequested", pageUrl: "https://business.test/" } });
  port.onmessage!({ data: { type: "business-page-url", requestId: message.requestId, pageUrl: "https://creator.test/" } });
  window.dispatchEvent(new CustomEvent(CREATOR_BUSINESS_PAGE_REQUEST, { detail: { workspaceId: "other", requestId: "other" } }));
  expect(port.postMessage).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1500);
  expect(await result).toBeUndefined();
});

it("cleans up pending URL requests and never falls back when no Host is connected", async () => {
  const port = await bridge();
  dispose!(); dispose = undefined;
  vi.useFakeTimers();
  const result = requestBusinessPageUrl("workspace");
  expect(port.postMessage).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1500);
  expect(await result).toBeUndefined();
});
