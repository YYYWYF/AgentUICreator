import { ConversationCanonicalComposer, ConversationComposerTextareaInput } from "./adapters/composer";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function ConversationComposerPlugin({
  renderSlot,
}: UIPluginComponentProps) {
  const labels = useAgentUILocale("composer");
  return (
    <div
      data-ui-plugin="composer"
      data-slot="aui_composer-plugin"
    >
      <ConversationCanonicalComposer
        queueLabels={labels}
        triggers={renderSlot("triggers", null)}
        input={renderSlot("input", <ConversationComposerTextareaInput />)}
        beforeInput={renderSlot("beforeInput", null)}
        leadingActions={renderSlot("leadingActions", null, { layout: "inline" })}
        trailingActions={renderSlot("trailingActions", null, { layout: "inline" })}
        submitAction={renderSlot("submitAction", null, { layout: "inline" })}
      />
    </div>
  );
}
