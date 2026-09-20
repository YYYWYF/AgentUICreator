import {
  ConversationComposerCancel,
  ConversationComposerSend,
} from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function AssistantUiSubmitActionPlugin(
  _props: UIPluginComponentProps,
) {
  const locale = useAgentUILocale("composer");
  return (
    <>
      <ConversationComposerSend label={locale.send} />
      <ConversationComposerCancel label={locale.stop} />
    </>
  );
}
