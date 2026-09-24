import { ConversationCanonicalComposer } from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiComposerPlugin({
  renderSlot,
}: UIPluginComponentProps) {
  return (
    <div
      data-ui-plugin="assistant-ui-composer"
      data-slot="aui_composer-plugin"
    >
      <ConversationCanonicalComposer
        beforeInput={renderSlot("beforeInput", null)}
        leadingActions={renderSlot("leadingActions", null, { layout: "inline" })}
        trailingActions={renderSlot("trailingActions", null, { layout: "inline" })}
        submitAction={renderSlot("submitAction", null, { layout: "inline" })}
      />
    </div>
  );
}
