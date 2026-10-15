import {
  ConversationComposerDictate,
  ConversationComposerStopDictation,
} from "@za38.03/agent-ui-react";
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
