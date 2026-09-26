import type {
  ConversationToolCallComponent,
  ConversationToolCallProps,
} from "@agent-ui/react";

import { projectAgentPlan } from "../../agent-ui/conversation/agents/agent-plan-projection";
import { AgentPlan } from "@agent-ui/react";
import { ConversationToolFallback } from "@agent-ui/react";

function shouldUseFallback(
  props: ConversationToolCallProps,
): boolean {
  return props.isError === true ||
    props.status.type === "requires-action" ||
    props.status.type === "incomplete";
}

export const MockAgentPlanToolUI: ConversationToolCallComponent = (props) => {
  const view = projectAgentPlan(props.args);
  if (shouldUseFallback(props) || view === null) {
    return <ConversationToolFallback {...props} />;
  }
  return (
    <div data-agent-ui-composition-part="plan">
      <AgentPlan steps={view.steps} activeIndex={view.activeIndex} />
    </div>
  );
};
