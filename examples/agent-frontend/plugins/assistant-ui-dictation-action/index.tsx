import {
  ConversationComposerDictate,
  ConversationComposerStopDictation,
} from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function AssistantUiDictationActionPlugin(
  _props: UIPluginComponentProps,
) {
  const locale = useAgentUILocale("composer");
  return (
    <>
      <ConversationComposerDictate label={locale.dictate} />
      <ConversationComposerStopDictation label={locale.stopDictation} />
    </>
  );
}
