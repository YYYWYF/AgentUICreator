import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { useHelpCardExpansion } from "../../hooks/useHelpCardExpansion";
import "./styles.css";

const messages: Record<string, string> = {
  "zh-CN": "知道了",
  "en-US": "Got it",
};

export function HelpDismissActionPlugin() {
  const localeCode = useAgentUILocaleCode();
  // Only the card that renders this action is affected.
  const { expanded, collapse } = useHelpCardExpansion();
  const text = messages[localeCode] ?? messages["zh-CN"]!;

  // Nothing to dismiss once the body is collapsed; the card title expands it again.
  if (!expanded) {
    return null;
  }

  return (
    <button
      type="button"
      className="help-dismiss-action"
      onClick={collapse}
    >
      {text}
    </button>
  );
}
