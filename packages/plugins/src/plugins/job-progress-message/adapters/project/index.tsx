import { CanonicalJobProgressMessage, type ConversationToolCallProps } from '@za38.03/agent-ui-plugins';
import { useAgentRuntime } from '@za38.03/agent-ui-runtime/ui/runtime/context/index';
/** Compatibility Host binding; state and actions remain in the existing Runtime. */
export function MockRunCiJobToolUI(props: ConversationToolCallProps) {
  const state = useAgentRuntime<unknown, unknown>(snapshot => snapshot.state);
  const { abortRun } = useAgentRuntime();
  return <CanonicalJobProgressMessage {...props} state={state} abortRun={abortRun} />;
}
