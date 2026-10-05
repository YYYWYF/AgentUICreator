import { agentUIDirectiveFormatter } from "./directive-formatter.js";
import { type TextMessagePartComponent } from "@assistant-ui/react";
import { createDirectiveText } from "./vendor/assistant-ui/components/assistant-ui/elements/directive-text.aui.js";
const knownTypes = new Set(["user", "resource", "file", "document", "command"]);
const DirectiveText = createDirectiveText({
  ...agentUIDirectiveFormatter,
  parse(text) {
    const segments = agentUIDirectiveFormatter.parse(text);
    // Preserve the entire original text if any unsupported directive is present.
    return segments.some(segment => segment.kind === "mention" && !knownTypes.has(segment.type))
      ? [{ kind: "text", text }]
      : segments;
  },
});

// The upstream plain-text fallback is a fragment; preserve canonical user whitespace.
export const ConversationUserDirectiveText: TextMessagePartComponent = props => (
  <span className="whitespace-pre-wrap"><DirectiveText {...props} /></span>
);
