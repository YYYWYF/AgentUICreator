import { WebSpeechDictationAdapter, type AttachmentAdapter, type DictationAdapter, type PendingAttachment } from "@assistant-ui/react";
import type { AgentUILocaleMessages } from "@za38.03/agent-ui-plugins";
import type { AttachmentConfig, DictationConfig, FeedbackConfig, ServiceRequestConfig } from "./service-config.js";
import type { ConversationFeedbackAdapter } from "./feedback.js";

type Messages = AgentUILocaleMessages["serviceAdapters"];
const DEFAULT_MAX_SIZE = 20 * 1024 * 1024;

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("", "AbortError");
}
function field(value: unknown, key: string): unknown {
  let current = value;
  for (const part of key.split(".")) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
function matches(file: File, accept: string) {
  return accept.split(",").some(item => {
    const pattern = item.trim().toLowerCase();
    return pattern === "*" || pattern === "*/*" || (pattern.startsWith(".")
      ? file.name.toLowerCase().endsWith(pattern)
      : pattern.endsWith("/*") ? file.type.toLowerCase().startsWith(pattern.slice(0, -1))
      : file.type.toLowerCase() === pattern);
  });
}
function multipartHeaders(config: ServiceRequestConfig) {
  const headers = new Headers(config.headers);
  // The browser must add the multipart boundary.
  headers.delete("Content-Type");
  return headers;
}
async function jsonRequest(url: string, init: RequestInit, messages: Messages) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${messages.requestFailed} (${response.status})`);
  try { return await response.json() as unknown; }
  catch { throw new Error(messages.invalidResponse); }
}
function fileUrl(value: unknown, endpoint: string, messages: Messages) {
  if (typeof value !== "string" || !value.trim()) throw new Error(messages.invalidUploadUrl);
  try {
    const base = new URL(endpoint, typeof location === "undefined" ? undefined : location.href);
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.href;
  } catch { throw new Error(messages.invalidUploadUrl); }
}
async function dataUrl(file: File, signal: AbortSignal | undefined): Promise<string> {
  checkAbort(signal);
  if (typeof FileReader !== "undefined") return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => { cleanup(); reader.abort(); reject(signal?.reason ?? new DOMException("", "AbortError")); };
    reader.onload = () => { cleanup(); resolve(String(reader.result)); };
    reader.onerror = () => { cleanup(); reject(reader.error); };
    signal?.addEventListener("abort", abort, { once: true });
    try { reader.readAsDataURL(file); }
    catch (error) { cleanup(); reject(error); }
  });
  const bytes = new Uint8Array(await file.arrayBuffer());
  checkAbort(signal);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

export function createAttachmentAdapter(config: AttachmentConfig, messages: Messages, pending = new Map<string, AbortController>()): AttachmentAdapter {
  const accept = config.accept ?? "*";
  const maximum = config.maxSizeBytes ?? DEFAULT_MAX_SIZE;
  if (!Number.isFinite(maximum) || maximum <= 0 || !accept.trim()) throw new Error(messages.invalidConfig);
  return {
    accept,
    async add({ file }) {
      if (!matches(file, accept)) throw new Error(messages.fileTypeRejected);
      if (file.size > maximum) throw new Error(messages.fileTooLarge);
      return { id: crypto.randomUUID(), type: file.type.startsWith("image/") ? "image" : "document",
        name: file.name, contentType: file.type || "application/octet-stream", file,
        status: { type: "requires-action", reason: "composer-send" } };
    },
    async remove(attachment) { pending.get(attachment.id)?.abort(); pending.delete(attachment.id); },
    async send(attachment: PendingAttachment, options?: { signal?: AbortSignal }) {
      const controller = new AbortController();
      const abort = () => controller.abort(options?.signal?.reason);
      options?.signal?.addEventListener("abort", abort, { once: true });
      if (options?.signal?.aborted) abort();
      pending.set(attachment.id, controller);
      try {
        checkAbort(controller.signal);
        let value: string;
        if (config.uploadUrl) {
          const body = new FormData(); body.append(config.fieldName ?? "file", attachment.file, attachment.name);
          const json = await jsonRequest(config.uploadUrl, { method: "POST", body, headers: multipartHeaders(config),
            credentials: config.credentials ?? "same-origin", signal: controller.signal }, messages);
          value = fileUrl(field(json, config.urlField ?? "url"), config.uploadUrl, messages);
        } else value = await dataUrl(attachment.file, controller.signal);
        checkAbort(controller.signal);
        const mimeType = attachment.contentType || attachment.file.type || "application/octet-stream";
        return { ...attachment, status: { type: "complete" as const }, content: mimeType.startsWith("image/")
          ? [{ type: "image" as const, image: value, filename: attachment.name }]
          : [{ type: "file" as const, data: value, mimeType, filename: attachment.name,
            ...(config.uploadUrl ? { sourceType: "url" as const } : {}) }] };
      } finally { options?.signal?.removeEventListener("abort", abort); pending.delete(attachment.id); }
    },
  };
}

export function createFeedbackAdapter(config: FeedbackConfig, messages: Messages): ConversationFeedbackAdapter {
  return { async submit(feedback) {
    if (!config.url) return; // assistant-ui owns the in-session selection.
    const headers = new Headers(config.headers); headers.set("Content-Type", "application/json");
    const response = await fetch(config.url, { method: "POST", headers, credentials: config.credentials ?? "same-origin", body: JSON.stringify(feedback) });
    if (!response.ok) throw new Error(`${messages.requestFailed} (${response.status})`);
  } };
}

export function createDictationAdapter(config: DictationConfig, messages: Messages, onError?: (error: Error) => void): DictationAdapter | undefined {
  if (config.url) return { listen: () => startRecording(config, messages, onError) };
  const browser = globalThis as typeof globalThis & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  if (!browser.SpeechRecognition && !browser.webkitSpeechRecognition) return undefined;
  return new WebSpeechDictationAdapter(config.language ? { language: config.language } : {});
}

function startRecording(config: DictationConfig, messages: Messages, onError?: (error: Error) => void): DictationAdapter.Session {
  const startListeners = new Set<() => void>();
  const speechListeners = new Set<(result: DictationAdapter.Result) => void>();
  const endListeners = new Set<(result: DictationAdapter.Result) => void>();
  const controller = new AbortController();
  let recorder: MediaRecorder | undefined;
  let media: MediaStream | undefined;
  let cancelled = false;
  let stopping = false;
  let stopResolve: () => void;
  const stopped = new Promise<void>(resolve => { stopResolve = resolve; });
  const release = () => { media?.getTracks().forEach(track => track.stop()); };
  const finish = (reason: "stopped" | "cancelled" | "error", transcript = "") => {
    if (session.status.type === "ended") return;
    session.status = { type: "ended", reason };
    release();
    for (const listener of endListeners) listener({ transcript, isFinal: true });
    stopResolve();
  };
  const fail = (cause: unknown) => {
    if (cancelled) return;
    const error = new Error(messages.dictationFailed, { cause });
    try { onError?.(error); } finally { finish("error"); }
  };
  const subscribe = <T,>(listeners: Set<T>, listener: T) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const session: DictationAdapter.Session = {
    status: { type: "starting" },
    async stop() { stopping = true; if (recorder?.state === "recording") recorder.stop(); return stopped; },
    cancel() { cancelled = true; controller.abort(); if (recorder?.state === "recording") recorder.stop(); finish("cancelled"); },
    onSpeechStart: listener => subscribe(startListeners, listener),
    onSpeech: listener => subscribe(speechListeners, listener),
    onSpeechEnd: listener => subscribe(endListeners, listener),
  };
  void (async () => {
    try {
      if (typeof MediaRecorder === "undefined" || !globalThis.navigator?.mediaDevices?.getUserMedia) throw new Error(messages.recordingUnavailable);
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelled) { release(); return; }
      if (stopping) { finish("stopped"); return; }
      recorder = new MediaRecorder(media);
      const chunks: Blob[] = [];
      recorder.addEventListener("dataavailable", event => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener("error", fail);
      recorder.addEventListener("stop", () => { void (async () => {
        release();
        if (cancelled || session.status.type === "ended") return;
        try {
          const mimeType = recorder?.mimeType || chunks[0]?.type || "audio/webm";
          const extension = ({ "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mpeg": "mp3" } as Record<string, string>)[mimeType.split(";", 1)[0]!] ?? "webm";
          const blob = new Blob(chunks, { type: mimeType });
          const body = new FormData(); body.append(config.fieldName ?? "file", blob, `recording.${extension}`);
          if (config.language) body.append("language", config.language);
          const json = await jsonRequest(config.url!, { method: "POST", body, headers: multipartHeaders(config),
            credentials: config.credentials ?? "same-origin", signal: controller.signal }, messages);
          checkAbort(controller.signal);
          const transcript = field(json, config.textField ?? "text");
          if (typeof transcript !== "string") throw new Error(messages.invalidResponse);
          for (const listener of speechListeners) listener({ transcript, isFinal: true });
          finish("stopped", transcript);
        } catch (error) { fail(error); }
      })(); });
      recorder.start(); session.status = { type: "running" };
      for (const listener of startListeners) listener();
    } catch (error) { fail(error); }
  })();
  return session;
}
