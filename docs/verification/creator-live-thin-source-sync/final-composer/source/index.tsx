import type { ConversationCanonicalComposerProps } from "./adapters/composer";
import { ConversationCanonicalComposer, ConversationComposerTextareaInput } from "./adapters/composer";
import { useAgentUILocale } from "../../../agent-ui/i18n/useAgentUILocale";
import type { UIPluginComponentProps } from "../../../framework/contracts/ui-plugin";

export function ConversationComposerPlugin({
  renderSlot, ...props
}: UIPluginComponentProps & ConversationCanonicalComposerProps) {
  const labels = useAgentUILocale("composer");
  return (
    <div
      data-ui-plugin="composer"
      data-slot="aui_composer-plugin"
    >
      <ConversationCanonicalComposer
        {...props}
        queueLabels={props.queueLabels ?? labels}
        triggers={renderSlot("triggers", props.triggers ?? null)}
        input={renderSlot("input", props.input ?? <ConversationComposerTextareaInput {...props.inputProps} />)}
        beforeInput={renderSlot("beforeInput", props.beforeInput ?? null)}
        leadingActions={renderSlot("leadingActions", props.leadingActions ?? null, { layout: "inline" })}
        trailingActions={renderSlot("trailingActions", props.trailingActions ?? null, { layout: "inline" })}
        submitAction={renderSlot("submitAction", props.submitAction ?? null, { layout: "inline" })}
      />
    </div>
  );
}
