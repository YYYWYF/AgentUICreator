import type { AttachmentAdapter, CompleteAttachment, PendingAttachment } from "@assistant-ui/react";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Development/demo only. Inline small images/PDFs; production storage belongs to the application. */
export class DemoAttachmentAdapter implements AttachmentAdapter {
  readonly accept = "image/*,application/pdf";

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      throw new Error("Demo attachments accept only images and PDF files.");
    }
    if (file.size > MAX_FILE_BYTES) throw new Error("Demo attachments are limited to 5 MiB per file.");
    return {
      id: crypto.randomUUID(),
      type: file.type.startsWith("image/") ? "image" : "document",
      name: file.name, contentType: file.type, file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  async remove(): Promise<void> {
    // No remote storage or application-owned attachment state.
  }

  async send(attachment: PendingAttachment, options?: { signal?: AbortSignal }): Promise<CompleteAttachment> {
    const dataUrl = await readDemoFile(attachment.file, options?.signal);
    return {
      ...attachment, status: { type: "complete" },
      content: attachment.type === "image"
        ? [{ type: "image", image: dataUrl, filename: attachment.name }]
        : [{ type: "file", data: dataUrl, mimeType: attachment.file.type, filename: attachment.name }],
    };
  }
}

// File reading is a demo adapter policy, never a Runtime or AG-UI transport policy.
function readDemoFile(file: File, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reader.abort();
      reject(signal?.reason ?? new DOMException("Attachment read aborted", "AbortError"));
    };
    if (signal?.aborted) { abort(); return; }
    reader.onload = () => {
      cleanup();
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Expected a file data URL."));
    };
    reader.onerror = () => { cleanup(); reject(reader.error ?? new Error("Could not read demo attachment.")); };
    signal?.addEventListener("abort", abort, { once: true });
    try { reader.readAsDataURL(file); }
    catch (error) { cleanup(); reject(error); }
  });
}
