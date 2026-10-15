import { DEFAULT_AGENT_UI_MESSAGES, type AgentUILocaleMessages } from "./locale.js";
import {
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  type AttachmentAdapter,
  type CompleteAttachment,
  type PendingAttachment,
} from "@assistant-ui/react";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function enforceDemoSize(file: File, messages: AgentUILocaleMessages["attachments"]): void {
  if (file.size > MAX_FILE_BYTES) throw new Error(messages.demoSizeExceeded);
}

/** Development/demo only. Production storage belongs to the application's adapter. */
export class DemoAttachmentAdapter extends CompositeAttachmentAdapter {
  constructor(private readonly messages: AgentUILocaleMessages["attachments"] = DEFAULT_AGENT_UI_MESSAGES.attachments) {
    super([new SimpleImageAttachmentAdapter(), new DemoPdfAttachmentAdapter(messages)]);
  }

  override add(state: { file: File }): ReturnType<AttachmentAdapter["add"]> {
    enforceDemoSize(state.file, this.messages);
    return super.add(state);
  }
}

/** Development/demo only: small PDFs, without an upload server or retained state. */
export class DemoPdfAttachmentAdapter implements AttachmentAdapter {
  readonly accept = "application/pdf";
  constructor(private readonly messages: AgentUILocaleMessages["attachments"] = DEFAULT_AGENT_UI_MESSAGES.attachments) {}

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    if (file.type !== this.accept) throw new Error(this.messages.demoPdfOnly);
    enforceDemoSize(file, this.messages);
    return {
      id: crypto.randomUUID(), type: "document",
      name: file.name, contentType: file.type, file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  async remove(): Promise<void> {
    // No remote storage or application-owned attachment state.
  }

  async send(attachment: PendingAttachment, options?: { signal?: AbortSignal }): Promise<CompleteAttachment> {
    const dataUrl = await readDemoPdf(attachment.file, this.messages, options?.signal);
    return {
      ...attachment, status: { type: "complete" },
      content: [{ type: "file", data: dataUrl, mimeType: attachment.file.type, filename: attachment.name }],
    };
  }
}

// PDF reading is a demo adapter policy, never a Runtime or AG-UI transport policy.
function readDemoPdf(file: File, messages: AgentUILocaleMessages["attachments"], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reader.abort();
      reject(signal?.reason ?? new DOMException(messages.demoReadAborted, "AbortError"));
    };
    if (signal?.aborted) { abort(); return; }
    reader.onload = () => {
      cleanup();
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error(messages.demoExpectedDataUrl));
    };
    reader.onerror = () => { cleanup(); reject(reader.error ?? new Error(messages.demoReadFailed)); };
    signal?.addEventListener("abort", abort, { once: true });
    try { reader.readAsDataURL(file); }
    catch (error) { cleanup(); reject(error); }
  });
}
