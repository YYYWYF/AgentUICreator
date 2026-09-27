import {
  ConversationToolFallback,
  JobProgress,
  type ConversationToolCallComponent,
  type ConversationToolCallProps,
} from "@agent-ui/react";

import {
  projectJobProgressState,
  projectRunCiJobArgs,
} from "../../state/job-progress-projection";
import {
  useAgentRuntimeActions,
  useAgentState,
} from "../../../../runtime/context";

function shouldUseFallback(
  props: ConversationToolCallProps,
): boolean {
  return props.isError === true ||
    props.status.type === "requires-action" ||
    props.status.type === "incomplete";
}

export const MockRunCiJobToolUI: ConversationToolCallComponent = (props) => {
  const state = useAgentState<unknown>();
  const { abortRun } = useAgentRuntimeActions();
  const args = projectRunCiJobArgs(props.args);
  const progress = projectJobProgressState(state, props.toolCallId);

  if (shouldUseFallback(props) || args === null || progress === null) {
    return <ConversationToolFallback {...props} />;
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
