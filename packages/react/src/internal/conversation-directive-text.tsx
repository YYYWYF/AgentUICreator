import { agentUIDirectiveFormatter, hasUnsupportedConversationDirective, conversationDirectiveDisplayLabel } from "./directive-formatter.js";
import { type TextMessagePartComponent } from "@assistant-ui/react";
import { createDirectiveText } from "./vendor/assistant-ui/components/assistant-ui/elements/directive-text.aui.js";
const DirectiveText = createDirectiveText({
  ...agentUIDirectiveFormatter,
  parse(text) {
    const segments = agentUIDirectiveFormatter.parse(text);
    // Preserve the entire original text if any unsupported directive is present.
    return hasUnsupportedConversationDirective(text)
      ? [{ kind: "text", text }]
      : segments.map(segment => segment.kind === "mention"
        ? { ...segment, label: conversationDirectiveDisplayLabel(segment.type, segment.label) } : segment);
  },
});

// The upstream plain-text fallback is a fragment; preserve canonical user whitespace.
export const ConversationUserDirectiveText: TextMessagePartComponent = props => (
  <span data-agent-ui-owned="" className="whitespace-pre-wrap"><DirectiveText {...props} /></span>
);
