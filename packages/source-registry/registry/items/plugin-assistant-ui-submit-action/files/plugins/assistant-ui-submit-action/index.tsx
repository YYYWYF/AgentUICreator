import {
  ConversationComposerCancel,
  ConversationComposerSend,
} from "@agent-ui/react";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiSubmitActionPlugin(
  _props: UIPluginComponentProps,
) {
  const labels = useAgentUILocale("composer");
  return (
    <>
      <ConversationComposerSend label={labels.send} queueLabel={labels.queueSend} />
      <ConversationComposerCancel label={labels.stop} />
    </>
  );
}
