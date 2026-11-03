import type { ConversationCanonicalComposerProps } from "@za38.03/agent-ui-plugins";
import { ConversationCanonicalComposer, ConversationComposerTextareaInput } from "@za38.03/agent-ui-plugins";
import { useAgentUILocale } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";

export function ConversationComposerPlugin({
  renderSlot, renderScopedSlot: _renderScopedSlot, ...props
}: UIPluginComponentProps & ConversationCanonicalComposerProps) {
  const labels = useAgentUILocale("composer");
  const { submitMode: inputSubmitMode, submitOnEnter, ...nativeInputProps } = props.inputProps ?? {};
  const submitMode = props.submitMode ?? inputSubmitMode;
  const fallbackInput = <ConversationComposerTextareaInput
    {...nativeInputProps}
    {...(props.rows === undefined ? {} : { rows: props.rows })}
    {...(props.maxLength === undefined ? {} : { maxLength: props.maxLength })}
    {...(submitMode === undefined
      ? (submitOnEnter === undefined ? {} : { submitOnEnter })
      : { submitMode })}
  />;
  return (
    <div
      data-ui-plugin="composer"
      data-slot="aui_composer-plugin"
    >
      <ConversationCanonicalComposer
        {...props}
        queueLabels={props.queueLabels ?? labels}
        triggers={renderSlot("triggers", props.triggers ?? null)}
        input={renderSlot("input", props.input ?? fallbackInput)}
        beforeInput={renderSlot("beforeInput", props.beforeInput ?? null)}
        leadingActions={renderSlot("leadingActions", props.leadingActions ?? null, { layout: "inline" })}
        trailingActions={renderSlot("trailingActions", props.trailingActions ?? null, { layout: "inline" })}
        submitAction={renderSlot("submitAction", props.submitAction ?? null, { layout: "inline" })}
      />
    </div>
  );
}
