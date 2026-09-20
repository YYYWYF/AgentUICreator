import {
  ConversationComposerDictate,
  ConversationComposerStopDictation,
} from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiDictationActionPlugin(
  _props: UIPluginComponentProps,
) {
  return (
    <>
      <ConversationComposerDictate />
      <ConversationComposerStopDictation />
    </>
  );
}
