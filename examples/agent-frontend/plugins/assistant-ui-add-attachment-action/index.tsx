import { ConversationComposerAddAttachment } from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function AssistantUiAddAttachmentActionPlugin(
  _props: UIPluginComponentProps,
) {
  const locale = useAgentUILocale("composer");
  return <ConversationComposerAddAttachment label={locale.addAttachment} />;
}
