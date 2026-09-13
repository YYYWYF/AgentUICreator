import type {
  ToolCallMessagePartComponent,
  ToolCallMessagePartProps,
} from "@assistant-ui/react";

import { projectAgentPlan } from "../../agents/agent-plan-projection";
import { AgentElementFrame } from "../../elements/AgentElementFrame";
import { AgentPlan } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/agent-plan";
import { ToolFallback } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui";

type MockAgentPlanArgs = Record<string, unknown>;

function shouldUseFallback(
  props: ToolCallMessagePartProps<MockAgentPlanArgs, unknown>,
): boolean {
  return props.isError === true ||
    props.status.type === "requires-action" ||
    props.status.type === "incomplete";
}

export const MockAgentPlanToolUI: ToolCallMessagePartComponent<
  MockAgentPlanArgs,
  unknown
> = (props) => {
  const view = projectAgentPlan(props.result);
  if (shouldUseFallback(props) || view === null) {
    return <ToolFallback {...props} />;
  }
  return (
    <AgentElementFrame kind="plan">
      <AgentPlan steps={view.steps} activeIndex={view.activeIndex} />
    </AgentElementFrame>
  );
};
