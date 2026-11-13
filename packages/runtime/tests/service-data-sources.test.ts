import { afterEach, describe, expect, it, vi } from "vitest";
import { enUS } from "../../plugins/src/locales/en-US.js";
import type { AttachmentDataSource, DictationDataSource, FeedbackDataSource } from "../src/index.js";
import { createAttachmentAdapter, createDictationAdapter, createFeedbackAdapter } from "../src/service-adapters.js";

const messages = enUS.serviceAdapters;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function attachment(dataSource: AttachmentDataSource, uploadUrl?: string) {
  const adapter = createAttachmentAdapter({ dataSource, uploadUrl }, messages);
  const pending = await adapter.add({ file: new File(["document"], "说明.pdf", { type: "application/pdf" }) });
  if (!("id" in pending)) throw new Error("Expected a pending attachment");
  return { adapter, pending };
}

function microphone() {
  const track = { stop: vi.fn() };
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
  class Recorder extends EventTarget {
    state = "inactive";
    mimeType = "audio/mp4";
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      const event = new Event("dataavailable");
      Object.assign(event, { data: new Blob(["recording"]) });
      this.dispatchEvent(event);
      this.dispatchEvent(new Event("stop"));
    }
  }
  vi.stubGlobal("MediaRecorder", Recorder);
  return track;
}

describe("custom upload data source", () => {
  it.each([undefined, "https://unused.test/upload"])("uses the business upload without fetch (URL: %s)", async uploadUrl => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    const upload = vi.fn<AttachmentDataSource["upload"]>(async () => "https://files.test/report.pdf");
    const { adapter, pending } = await attachment({ upload }, uploadUrl);
    const sent = await adapter.send(pending);
    expect(upload).toHaveBeenCalledWith(pending.file, { signal: expect.any(AbortSignal) });
    expect(sent.content).toEqual([{ type: "file", data: "https://files.test/report.pdf", sourceType: "url", mimeType: "application/pdf", filename: "说明.pdf" }]);
    expect(request).not.toHaveBeenCalled();
  });

  it("resolves relative business file URLs against the page", async () => {
    vi.stubGlobal("location", { href: "https://host.test/app/" });
    const { adapter, pending } = await attachment({ upload: async () => "files/a.pdf" }, "https://unused.test/upload");
    expect((await adapter.send(pending)).content[0]).toMatchObject({ data: "https://host.test/app/files/a.pdf" });
  });

  it.each(["", "javascript:alert(1)", "blob:preview"])("rejects unusable business file URLs: %s", async url => {
    const { adapter, pending } = await attachment({ upload: async () => url });
    await expect(adapter.send(pending)).rejects.toThrow(messages.invalidUploadUrl);
  });

  it("forwards business errors without falling back to the URL", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    const error = new Error("business upload failed");
    const { adapter, pending } = await attachment({ upload: async () => { throw error; } }, "https://unused.test/upload");
    await expect(adapter.send(pending)).rejects.toBe(error);
    expect(request).not.toHaveBeenCalled();
  });

  it("passes cancellation through and refuses a late result after removal", async () => {
    let resolve!: (url: string) => void;
    const upload = vi.fn<AttachmentDataSource["upload"]>(() => new Promise(done => { resolve = done; }));
    const { adapter, pending } = await attachment({ upload });
    const sent = adapter.send(pending);
    await adapter.remove(pending);
    expect(upload.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    resolve("https://files.test/late.pdf");
    await expect(sent).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not invoke the business upload with an already cancelled request", async () => {
    const upload = vi.fn<AttachmentDataSource["upload"]>();
    const { adapter, pending } = await attachment({ upload });
    await expect(adapter.send(pending, { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("custom feedback data source", () => {
  const feedback = { threadId: "thread-1", messageId: "message-1", type: "negative" as const, comment: "Missing source" };
  it.each([undefined, "/unused/feedback"])("passes feedback to the business service (URL: %s)", async url => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    const submit = vi.fn<FeedbackDataSource["submit"]>();
    await createFeedbackAdapter({ dataSource: { submit }, url }, messages).submit(feedback);
    expect(submit).toHaveBeenCalledWith(feedback);
    expect(request).not.toHaveBeenCalled();
  });

  it("propagates business persistence errors", async () => {
    const error = new Error("business feedback failed");
    await expect(createFeedbackAdapter({ dataSource: { submit: async () => { throw error; } } }, messages).submit(feedback)).rejects.toBe(error);
  });
});

describe("custom transcription data source", () => {
  it.each([undefined, "/unused/transcribe"])("sends recorded audio to the business service (URL: %s)", async url => {
    const track = microphone();
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    const transcribe = vi.fn<DictationDataSource["transcribe"]>(async () => "识别结果");
    const session = createDictationAdapter({ dataSource: { transcribe }, url, language: "zh-CN" }, messages)!.listen();
    const speech = vi.fn(); const end = vi.fn();
    session.onSpeech(speech); session.onSpeechEnd(end);
    await vi.waitFor(() => expect(session.status.type).toBe("running"));
    await session.stop();
    const [audio, options] = transcribe.mock.calls[0]!;
    expect(audio).toBeInstanceOf(File);
    expect(audio.name).toBe("recording.m4a");
    expect(audio.type).toBe("audio/mp4");
    expect(await audio.text()).toBe("recording");
    expect(options).toEqual({ signal: expect.any(AbortSignal), language: "zh-CN" });
    expect(speech).toHaveBeenCalledWith({ transcript: "识别结果", isFinal: true });
    expect(end).toHaveBeenCalledWith({ transcript: "识别结果", isFinal: true });
    expect(track.stop).toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("cancels an in-flight business transcription and ignores its late result", async () => {
    const track = microphone();
    let resolve!: (text: string) => void;
    const transcribe = vi.fn<DictationDataSource["transcribe"]>(() => new Promise(done => { resolve = done; }));
    const onError = vi.fn();
    const session = createDictationAdapter({ dataSource: { transcribe } }, messages, onError)!.listen();
    const speech = vi.fn(); session.onSpeech(speech);
    await vi.waitFor(() => expect(session.status.type).toBe("running"));
    const stopped = session.stop();
    expect(transcribe).toHaveBeenCalledOnce();
    session.cancel(); await stopped;
    expect(transcribe.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    resolve("late transcript"); await Promise.resolve();
    expect(session.status).toEqual({ type: "ended", reason: "cancelled" });
    expect(speech).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it("reports business transcription failure and releases the microphone", async () => {
    const track = microphone();
    const error = new Error("business transcription failed");
    const onError = vi.fn();
    const session = createDictationAdapter({ dataSource: { transcribe: async () => { throw error; } } }, messages, onError)!.listen();
    await vi.waitFor(() => expect(session.status.type).toBe("running"));
    await session.stop();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: messages.dictationFailed, cause: error }));
    expect(session.status).toEqual({ type: "ended", reason: "error" });
    expect(track.stop).toHaveBeenCalled();
  });
});
