import { JobProgressMessagePlugin as Implementation } from "@za38.03/agent-ui-plugins/job-progress-message";
import type { ComponentProps } from "react";
import { useAgentState, useAgentRuntimeActions } from "../../runtime/context";

export function JobProgressMessagePlugin(props: ComponentProps<typeof Implementation>) {
  const state = useAgentState();
  const { abortRun } = useAgentRuntimeActions();
  return <Implementation state={state} abortRun={abortRun} {...props} />;
}
