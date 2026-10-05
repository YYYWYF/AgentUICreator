import { parseAgentUIDirectives, trySerializeAgentUIDirective } from "@agent-ui/runtime-core";
import type { Unstable_DirectiveFormatter } from "@assistant-ui/react";

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
