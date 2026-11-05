import { useAgentUILocaleCode, useConversationComposer } from "@za38.03/agent-ui-plugins";
import "./styles.css";

/** Project-owned labels and draft text keyed by the unified Agent UI locale code. */
const messages: Record<string, { label: string; draft: string }> = {
  "zh-CN": { label: "查看示例", draft: "请给我一个使用示例" },
  "en-US": { label: "View example", draft: "Please give me a usage example" },
};

export function QuickHelpExampleActionPlugin() {
  const localeCode = useAgentUILocaleCode();
  const { setText } = useConversationComposer();
  const text = messages[localeCode] ?? messages["zh-CN"]!;

  // Only fill the existing canonical draft; the user reviews it and presses send.
  return (
    <button
      type="button"
      className="quick-help-example-action"
      onClick={() => setText(text.draft)}
    >
      {text.label}
    </button>
  );
}
