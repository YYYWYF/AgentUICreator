import { ConversationCanonicalComposer, ConversationComposerTextareaInput } from "@agent-ui/react";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiComposerPlugin({
  renderSlot,
}: UIPluginComponentProps) {
  const labels = useAgentUILocale("composer");
  return (
    <div
      data-ui-plugin="assistant-ui-composer"
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
