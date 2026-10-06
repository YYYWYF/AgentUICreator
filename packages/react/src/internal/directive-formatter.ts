import { parseAgentUIDirectives, trySerializeAgentUIDirective } from "@agent-ui/runtime-core";
import type { Unstable_DirectiveFormatter } from "@assistant-ui/react";

const knownDirectiveTypes = new Set(["user", "resource", "file", "document", "command"]);

export function hasUnsupportedConversationDirective(text: string): boolean {
  return parseAgentUIDirectives(text).some(segment => segment.kind !== "text" && !knownDirectiveTypes.has(segment.type));
}

/** Presentation only; never feed the prefixed label back into serialization. */
export function conversationDirectiveDisplayLabel(type: string, label: string): string {
  return `${type === "command" ? "/" : "@"}${label}`;
}

/** Adapt the product contract to assistant-ui's presentation vocabulary. */
export const agentUIDirectiveFormatter: Unstable_DirectiveFormatter = {
  serialize(reference) {
    const text = trySerializeAgentUIDirective(reference);
    if (text === undefined) throw new Error("Invalid Agent UI directive reference.");
    return text;
  },
  parse(text) {
    return parseAgentUIDirectives(text).map(segment => segment.kind === "text"
      ? segment : { ...segment, kind: "mention" as const });
  },
};
