import type {
  ConversationToolCallComponent,
  ConversationToolCallProps,
} from "@agent-ui/react";

import { projectAgentPlan } from "../../agents/agent-plan-projection";
import { AgentElementFrame } from "../../elements/AgentElementFrame";
import { AgentPlan } from "@agent-ui/react";
import { ConversationToolFallback } from "@agent-ui/react";

type MockAgentPlanArgs = Record<string, unknown>;

function shouldUseFallback(
  props: ConversationToolCallProps,
): boolean {
  return props.isError === true ||
    props.status.type === "requires-action" ||
    props.status.type === "incomplete";
}

export const MockAgentPlanToolUI: ConversationToolCallComponent = (props) => {
  const view = projectAgentPlan(props.result);
  if (shouldUseFallback(props) || view === null) {
    return <ConversationToolFallback {...props} />;
  }
  return (
    <AgentElementFrame kind="plan">
      <AgentPlan steps={view.steps} activeIndex={view.activeIndex} />
    </AgentElementFrame>
  );
};
