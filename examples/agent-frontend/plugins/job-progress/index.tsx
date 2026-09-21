import { JobProgress } from "@agent-ui/react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {
  useAgentRuntimeActions,
  useAgentState,
} from "../../runtime/context";
import { projectJobProgressState } from "../../agent-ui/conversation/state/job-progress-projection";

export function JobProgressPlugin(_props: UIPluginComponentProps) {
  const state = useAgentState<unknown>();
  const job = projectJobProgressState(state);
  const { abortRun } = useAgentRuntimeActions();

  if (job === null) return null;

  return (
    <JobProgress
      title={job.title}
      stages={job.stages}
      stageIndex={job.stageIndex}
      stageProgress={job.stageProgress}
      eta={job.eta}
      onCancel={abortRun}
    />
  );
}
