import {
  ConversationCanonicalComposer,
} from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function AssistantUiComposerPlugin({
  renderSlot,
}: UIPluginComponentProps) {
  const locale = useAgentUILocale("composer");

  return (
    <div
      data-ui-plugin="assistant-ui-composer"
      data-slot="aui_composer-plugin"
    >
      <ConversationCanonicalComposer
        placeholder={locale.placeholder}
        inputAriaLabel={locale.input}
        beforeInput={renderSlot("beforeInput", null)}
        leadingActions={renderSlot("leadingActions", null, { layout: "inline" })}
        trailingActions={renderSlot("trailingActions", null, { layout: "inline" })}
        submitAction={renderSlot("submitAction", null, { layout: "inline" })}
      />
    </div>
  );
}
