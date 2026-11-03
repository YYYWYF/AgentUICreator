import { afterEach, describe, expect, it, vi } from "vitest";
import { enUS } from "../../plugins/src/locales/en-US.js";
import { createAttachmentAdapter, createDictationAdapter, createFeedbackAdapter } from "../src/service-adapters.js";
const messages = enUS.serviceAdapters;
const pdf = () => new File(["%PDF-1.7"], "说明 文档.PDF", { type: "application/pdf" });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function prepare(config = {}) {
  const adapter = createAttachmentAdapter(config, messages);
  const pending = await adapter.add({ file: pdf() });
  if (!("id" in pending)) throw new Error("Expected a pending file");
  return { adapter, pending };
}

describe("concrete file configuration", () => {
  it("embeds binary documents and images without any service", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    const { adapter, pending } = await prepare();
    const sent = await adapter.send(pending);
    expect(sent.content).toEqual([{ type: "file", data: `data:application/pdf;base64,${btoa("%PDF-1.7")}`, mimeType: "application/pdf", filename: "说明 文档.PDF" }]);
    const image = await adapter.add({ file: new File(["png"], "图.png", { type: "image/png" }) });
    if (!("id" in image)) throw new Error();
    expect((await adapter.send(image)).content).toEqual([{ type: "image", image: "data:image/png;base64,cG5n", filename: "图.png" }]);
    expect(request).not.toHaveBeenCalled();
  });
  it("uploads multipart and puts the response URL in the file content", async () => {
    const request = vi.fn(async () => Response.json({ body: { download: "https://files.test/report.pdf" } })); vi.stubGlobal("fetch", request);
    const { adapter, pending } = await prepare({ uploadUrl: "https://api.test/upload", fieldName: "document", urlField: "body.download", credentials: "include", headers: { Authorization: "Bearer user-token", "Content-Type": "application/json" } });
    expect((await adapter.send(pending)).content).toEqual([{ type: "file", data: "https://files.test/report.pdf", sourceType: "url", mimeType: "application/pdf", filename: "说明 文档.PDF" }]);
    const [url, init] = request.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/upload"); expect(init.credentials).toBe("include");
    expect((init.body as FormData).get("document")).toBeInstanceOf(File);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer user-token");
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });
  it("resolves relative returned URLs against the upload origin", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ url: "/files/a.pdf" })));
    const { adapter, pending } = await prepare({ uploadUrl: "https://api.test/upload" });
    expect((await adapter.send(pending)).content[0]).toMatchObject({ data: "https://api.test/files/a.pdf", sourceType: "url" });
  });
  it.each([{}, { url: "javascript:alert(1)" }, { url: "blob:local-preview" }])("rejects unusable upload results %j", async result => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(result)));
    const { adapter, pending } = await prepare({ uploadUrl: "https://api.test/upload" });
    await expect(adapter.send(pending)).rejects.toThrow(messages.invalidUploadUrl);
  });
  it("reports HTTP failures rather than sending an error response as content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("offline", { status: 503 })));
    const { adapter, pending } = await prepare({ uploadUrl: "https://api.test/upload" });
    await expect(adapter.send(pending)).rejects.toThrow("503");
    expect(pending.status.type).toBe("requires-action");
  });
  it("enforces type and size with case-insensitive filename extensions", async () => {
    const { adapter } = await prepare({ accept: ".pdf", maxSizeBytes: 8 });
    await expect(adapter.add({ file: new File(["123456789"], "a.pdf") })).rejects.toThrow(messages.fileTooLarge);
    await expect(adapter.add({ file: new File(["1"], "a.exe") })).rejects.toThrow(messages.fileTypeRejected);
  });
  it("aborts pending uploads when the file is removed", async () => {
    const request = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("", "AbortError")), { once: true });
    })); vi.stubGlobal("fetch", request);
    const { adapter, pending } = await prepare({ uploadUrl: "https://api.test/upload" });
    const sent = adapter.send(pending); const rejected = expect(sent).rejects.toMatchObject({ name: "AbortError" });
    await adapter.remove(pending); await rejected;
    expect((request.mock.calls[0]![1].signal as AbortSignal).aborted).toBe(true);
  });
  it("does not start work after cancellation", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    const { adapter, pending } = await prepare({ uploadUrl: "https://api.test/upload" });
    await expect(adapter.send(pending, { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("feedback configuration", () => {
  const feedback = { threadId: "thread-1", messageId: "message-1", type: "negative" as const, comment: "Missing source" };
  it("keeps default feedback local without a network request", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await createFeedbackAdapter({}, messages).submit(feedback);
    expect(request).not.toHaveBeenCalled();
  });
  it("posts the actual conversation and message identity as JSON", async () => {
    const request = vi.fn(async () => new Response(null, { status: 204 })); vi.stubGlobal("fetch", request);
    await createFeedbackAdapter({ url: "/api/feedback", headers: { Authorization: "Bearer user-token" } }, messages).submit(feedback);
    const [url, init] = request.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("/api/feedback"); expect(JSON.parse(String(init.body))).toEqual(feedback);
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });
});

describe("dictation configuration", () => {
  it("leaves browser dictation unavailable on unsupported platforms", () => {
    vi.stubGlobal("SpeechRecognition", undefined); vi.stubGlobal("webkitSpeechRecognition", undefined);
    expect(createDictationAdapter({}, messages)).toBeUndefined();
  });
  it("uses the browser implementation when supported", () => {
    vi.stubGlobal("SpeechRecognition", class {});
    expect(createDictationAdapter({ language: "zh-CN" }, messages)?.listen).toBeTypeOf("function");
  });
  it("records, releases tracks and sends audio to a configured transcription service", async () => {
    const track = { stop: vi.fn() };
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } });
    class Recorder extends EventTarget {
      state = "inactive"; mimeType = "audio/webm";
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; const data = new Event("dataavailable"); Object.assign(data, { data: new Blob(["audio"]) }); this.dispatchEvent(data); this.dispatchEvent(new Event("stop")); }
    }
    vi.stubGlobal("MediaRecorder", Recorder);
    const request = vi.fn(async () => Response.json({ body: { transcript: "识别结果" } })); vi.stubGlobal("fetch", request);
    const session = createDictationAdapter({ url: "/api/transcribe", fieldName: "audio", textField: "body.transcript", language: "zh-CN" }, messages)!.listen();
    const speech = vi.fn(); const end = vi.fn(); session.onSpeech(speech); session.onSpeechEnd(end);
    await vi.waitFor(() => expect(session.status.type).toBe("running"));
    await session.stop();
    expect(speech).toHaveBeenCalledWith({ transcript: "识别结果", isFinal: true });
    expect(end).toHaveBeenCalledWith({ transcript: "识别结果", isFinal: true });
    expect(track.stop).toHaveBeenCalled();
    const [, init] = request.mock.calls[0]! as unknown as [string, RequestInit];
    expect((init.body as FormData).get("audio")).toBeInstanceOf(File);
    expect((init.body as FormData).get("language")).toBe("zh-CN");
  });
  it("cancels even while microphone permission is pending and releases late tracks", async () => {
    const track = { stop: vi.fn() }; let grant!: (value: unknown) => void;
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => new Promise(resolve => { grant = resolve; }) } });
    vi.stubGlobal("MediaRecorder", class {}); const request = vi.fn(); vi.stubGlobal("fetch", request);
    const session = createDictationAdapter({ url: "/api/transcribe" }, messages)!.listen();
    session.cancel(); grant({ getTracks: () => [track] }); await Promise.resolve(); await session.stop();
    expect(session.status).toEqual({ type: "ended", reason: "cancelled" });
    expect(track.stop).toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
  });
  it("reports microphone failures and ends the session", async () => {
    vi.stubGlobal("MediaRecorder", class {}); vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => { throw new Error("permission"); } } });
    const onError = vi.fn(); const session = createDictationAdapter({ url: "/api/transcribe" }, messages, onError)!.listen();
    await vi.waitFor(() => expect(session.status.type).toBe("ended"));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: messages.dictationFailed }));
  });
});
