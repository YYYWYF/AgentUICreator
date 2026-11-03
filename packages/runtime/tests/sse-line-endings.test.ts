import { afterEach, expect, it, vi } from "vitest";
import { fetchWithSseLineEndings, normalizeSseResponse } from "../src/compatibility/sse-line-endings.js";

afterEach(() => vi.unstubAllGlobals());
it("normalizes all SSE line endings even when every UTF-8 byte is a separate chunk", async () => {
  const input = 'data: {"text":"中文🚀 café\\r\\n"}\r\n\r\ndata: {}\r\rdata: {}\n\n';
  const bytes = new TextEncoder().encode(input);
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  const response = normalizeSseResponse(new Response(stream, { headers: { "Content-Type": "Text/Event-Stream; charset=utf-8", "Content-Length": "42", "Content-Encoding": "gzip", ETag: '"original"', "X-Request-ID": "kept" } }));
  expect(await response.text()).toBe('data: {"text":"中文🚀 café\\r\\n"}\n\ndata: {}\n\ndata: {}\n\n');
  expect(response.headers.has("content-length")).toBe(false); expect(response.headers.has("content-encoding")).toBe(false); expect(response.headers.has("etag")).toBe(false); expect(response.headers.get("x-request-id")).toBe("kept");
});
it("passes through JSON and protobuf responses without consuming or replacing them", async () => {
  for (const contentType of ["application/json", "application/vnd.ag-ui.proto", "text/plain"]) {
    const response = new Response("original\r\nbytes", { status: 503, headers: { "Content-Type": contentType } });
    expect(normalizeSseResponse(response)).toBe(response); expect(response.bodyUsed).toBe(false); expect(await response.text()).toBe("original\r\nbytes");
  }
});
it("emits a live chunk before the upstream stream finishes and propagates cancellation", async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>; const cancel = vi.fn();
  const response = normalizeSseResponse(new Response(new ReadableStream<Uint8Array>({ start(controller) { source = controller; }, cancel }), { headers: { "Content-Type": "text/event-stream" } }));
  const reader = response.body!.getReader(); const next = reader.read(); source.enqueue(new TextEncoder().encode("data: {}\r\n\r\n"));
  expect(new TextDecoder().decode((await next).value)).toBe("data: {}\n\n");
  await reader.cancel("user stopped"); await vi.waitFor(() => expect(cancel).toHaveBeenCalledExactlyOnceWith("user stopped"));
});
it("keeps the original fetch arguments, abort signal and non-success status", async () => {
  const response = new Response("data: {}\r\n\r\n", { status: 429, statusText: "Too Many Requests", headers: { "Content-Type": "text/event-stream" } });
  const fetch = vi.fn(async () => response); vi.stubGlobal("fetch", fetch); const signal = new AbortController().signal;
  const init = { method: "POST", headers: { Authorization: "Fixture token" }, body: "{}", signal };
  const result = await fetchWithSseLineEndings("https://fixture.test/agent", init); expect(fetch).toHaveBeenCalledExactlyOnceWith("https://fixture.test/agent", init);
  expect(result.status).toBe(429); expect(result.statusText).toBe("Too Many Requests"); expect(await result.text()).toBe("data: {}\n\n");
});
it("propagates an upstream read failure", async () => {
  const response = normalizeSseResponse(new Response(new ReadableStream({ start(controller) { controller.error(new Error("connection closed")); } }), { headers: { "Content-Type": "text/event-stream" } }));
  await expect(response.text()).rejects.toThrow("connection closed");
});
