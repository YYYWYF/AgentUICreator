import { AIMessage, type BaseMessage } from "@langchain/core/messages";

/** The two representations produced by the pinned Chat Completions adapter. */
export function reasoningContent(message: BaseMessage): string | undefined {
  if (!AIMessage.isInstance(message)) return undefined;
  const provider = message.additional_kwargs.reasoning_content;
  if (typeof provider === "string") return provider;
  if (!Array.isArray(message.content)) return undefined;
  const blocks = message.content.filter(block => block.type === "reasoning" && typeof block.reasoning === "string");
  return blocks.length ? blocks.map(block => block.reasoning).join("") : undefined;
}

/** Native content blocks already participate in the existing context estimate. */
export function reasoningOutsideContent(message: BaseMessage): string | undefined {
  const reasoning = reasoningContent(message);
  if (reasoning === undefined) return undefined;
  const blocks = Array.isArray(message.content) ? message.content.filter(block => block.type === "reasoning" && typeof block.reasoning === "string") : [];
  return blocks.length && blocks.map(block => block.reasoning).join("") === reasoning ? undefined : reasoning;
}
