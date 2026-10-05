import {
  ConversationToolFallback,
  JobProgress,
  type ConversationToolCallComponent,
  type ConversationToolCallProps,
} from "@agent-ui/react";

import {
  projectJobProgressState,
  projectRunCiJobArgs,
  projectRunCiJobResult,
} from "../../agent-ui/conversation/state/job-progress-projection";
import {
  useAgentRuntimeActions,
  useAgentState,
} from "../../runtime/context";

function projectLifecycleOutcome(
  props: ConversationToolCallProps,
) {
  if (props.isError === true) return { status: "failed" as const };
  if (props.status.type !== "incomplete") return null;
  if (props.status.reason === "cancelled") return { status: "cancelled" as const };
  if (props.status.reason === "error") return { status: "failed" as const };
  return null;
}

export const MockRunCiJobToolUI: ConversationToolCallComponent = (props) => {
  const state = useAgentState<unknown>();
  const { abortRun } = useAgentRuntimeActions();
  const args = projectRunCiJobArgs(props.args);
  const progress = projectJobProgressState(state, props.toolCallId);
  const result = projectRunCiJobResult(props.result);
  const outcome = result.outcome ?? projectLifecycleOutcome(props);

  if (
    props.status.type === "requires-action" ||
    (props.status.type === "incomplete" && outcome === null) ||
    args === null ||
    progress === null ||
    (outcome === null && (
      props.status.type === "complete" ||
      progress.stageIndex >= args.stages.length
    ))
  ) {
    return <ConversationToolFallback {...props} />;
  }

  return (
    <JobProgress
      title={args.target}
      stages={args.stages}
      stageIndex={progress.stageIndex}
      stageProgress={progress.stageProgress}
      eta={progress.eta}
      {...(outcome === null ? { onCancel: abortRun } : { outcome })}
      {...(result.elapsedMs === undefined ? {} : { elapsedMs: result.elapsedMs })}
    />
  );
};
