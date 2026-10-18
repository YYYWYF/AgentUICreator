import { CanonicalJobProgressMessage, type ConversationToolCallProps } from "@za38.03/agent-ui-plugins";
import { useAgentRuntimeActions, useAgentState } from "../../runtime/context";
/** Compatibility Host binding; state and actions remain in the existing Runtime. */
export function MockRunCiJobToolUI(props: ConversationToolCallProps) {
  const state = useAgentState<unknown>();
  const { abortRun } = useAgentRuntimeActions();
  return <CanonicalJobProgressMessage {...props} state={state} abortRun={abortRun} />;
}
