import {
  ConversationToolResult,
  JobProgress,
  type ConversationToolCallComponent,
  type ConversationToolCallProps} from "@za38.03/agent-ui-plugins";

import {
  projectJobProgressState,
  projectRunCiJobArgs} from "../../state/job-progress-projection";
import { useAgentRuntime } from "../../../../runtime/context";

function shouldUseFallback(
  props: ConversationToolCallProps,
): boolean {
  return props.isError === true ||
    props.status.type === "requires-action" ||
    props.status.type === "incomplete";
}

export const MockRunCiJobToolUI: ConversationToolCallComponent = (props) => {
  const state = useAgentRuntime<unknown, unknown>(snapshot => snapshot.state);
  const { abortRun } = useAgentRuntime();
  const args = projectRunCiJobArgs(props.args);
  const progress = projectJobProgressState(state, props.toolCallId);

  if (shouldUseFallback(props) || args === null || progress === null) {
    return <ConversationToolResult {...props} />;
  }

  return (
    <JobProgress
      title={args.target}
      stages={args.stages}
      stageIndex={progress.stageIndex}
      stageProgress={progress.stageProgress}
      eta={progress.eta}
      onCancel={abortRun}
    />
  );
};
