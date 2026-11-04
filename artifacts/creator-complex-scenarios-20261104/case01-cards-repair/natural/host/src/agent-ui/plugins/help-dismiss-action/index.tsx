import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import {
  collapseQuickHelpCard,
  useQuickHelpCardExpanded,
  useQuickHelpCardInstanceId,
} from "../../hooks/useQuickHelpCardExpanded";
import "./styles.css";

const messages: Record<string, string> = {
  "zh-CN": "知道了",
  "en-US": "Got it",
};

export function HelpDismissActionPlugin() {
  const localeCode = useAgentUILocaleCode();
  // The owning card publishes its instance id, so several cards dismiss only
  // their own body.
  const cardId = useQuickHelpCardInstanceId();
  const expanded = useQuickHelpCardExpanded(cardId);
  const text = messages[localeCode] ?? messages["zh-CN"]!;

  // Nothing to dismiss once the body is collapsed; the card title expands it again.
  if (!expanded) {
    return null;
  }

  return (
    <button
      type="button"
      className="help-dismiss-action"
      onClick={() => collapseQuickHelpCard(cardId)}
    >
      {text}
    </button>
  );
}
