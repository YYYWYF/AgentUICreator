import type { AgentUserInput } from "@za38.03/agent-ui-core";
import type { ContentPart } from "@ag-ui/client";
import { fromThreadMessageLike, generateId, type CreateAppendMessage } from "@assistant-ui/core";
import { fromAgUiMessages } from "@assistant-ui/react-ag-ui";
import { InvalidAgentInputError, UnsupportedAgentInputError } from "../errors.js";

/** Validate before appending; the installed converter owns attachments and content order. */
export function mapConversationUserInput(input: string | AgentUserInput): Exclude<CreateAppendMessage, string> | undefined {
  const content = typeof input === "string" ? input : input?.content;
  if (typeof content === "string") {
    return content.length ? { role: "user", content: [{ type: "text", text: content }] } : undefined;
  }
  if (!Array.isArray(content)) throw new InvalidAgentInputError("content must be text or an array");
  const parts: ContentPart[] = content.map(part => {
    if (!part || typeof part !== "object") throw new InvalidAgentInputError("invalid content part");
    if (part.type === "text") {
      if (typeof part.text !== "string") throw new InvalidAgentInputError("text must be a string");
      return { type: "text", text: part.text };
    }
    if (!["image", "document", "audio", "video"].includes(part.type)) throw new UnsupportedAgentInputError(part.type);
    if (!part.source || typeof part.source !== "object") throw new InvalidAgentInputError("missing attachment source");
    if (part.source.type !== "url") throw new UnsupportedAgentInputError(`${part.type}/${part.source.type}`);
    const value: unknown = part.source.value;
    let url: URL;
    try {
      if (typeof value !== "string" || !value.trim()) throw new Error();
      // URL resolution is a browser concern; never interpret native filesystem paths.
      url = new URL(value, typeof location === "undefined" ? undefined : location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch { throw new InvalidAgentInputError("attachment URL must resolve to HTTP(S)"); }
    if (part.name !== undefined && (typeof part.name !== "string" || !part.name.trim())) {
      throw new InvalidAgentInputError("attachment name must be a non-empty string");
    }
    const declaredMime: unknown = part.source.mimeType;
    if (declaredMime !== undefined && typeof declaredMime !== "string") throw new InvalidAgentInputError("invalid MIME type");
    const mimeType = typeof declaredMime === "string"
      ? declaredMime.trim().replace(/^[^;]+/u, type => type.trimEnd().toLowerCase()) : undefined;
    if (mimeType !== undefined && !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:\s*;.*)?$/u.test(mimeType)) {
      throw new InvalidAgentInputError("invalid MIME type");
    }
    const modality = mimeType?.split("/", 1)[0];
    if (((part.type === "audio" || part.type === "video") && modality !== part.type) ||
        (part.type === "image" && mimeType !== undefined && modality !== "image") ||
        (part.type === "document" && ["image", "audio", "video"].includes(modality ?? ""))) {
      throw new InvalidAgentInputError("MIME type must match the attachment type; audio/video require a MIME type");
    }
    return {
      type: part.type,
      source: { type: "url", value: url.href, ...(mimeType === undefined ? {} : { mimeType }) },
      ...(part.name === undefined ? {} : { metadata: { filename: part.name } }),
    };
  });
  if (parts.every(part => part.type === "text")) {
    // Preserve the established plain-text concatenation behavior.
    return mapConversationUserInput(parts.map(part => part.type === "text" ? part.text : "").join(""));
  }
  const message = fromAgUiMessages([{ role: "user", content: parts }])[0];
  if (message === undefined) throw new InvalidAgentInputError("user message conversion failed");
  return fromThreadMessageLike({ ...message, content: message.content === "" ? [] : message.content },
    message.id ?? generateId(), { type: "complete", reason: "stop" });
}
