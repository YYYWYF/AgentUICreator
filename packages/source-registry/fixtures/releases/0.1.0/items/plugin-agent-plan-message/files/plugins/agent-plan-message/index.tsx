import {
  AgentPlan,
  defineDataMessageUI,
  type DataMessageUIRenderProps,
} from "@agent-ui/react";
import {
  projectAgentPlanActivity,
} from "../../agent-contract/agent-plan-activity";

function AgentPlanActivityMessage({
  data,
}: DataMessageUIRenderProps<unknown>) {
  const plan = projectAgentPlanActivity(data);
  if (plan === null) return null;

  return (
    <div data-agent-ui-composition-part="plan">
      <AgentPlan
        {...(plan.title === undefined ? {} : { title: plan.title })}
        steps={plan.steps}
        activeIndex={plan.activeIndex}
      />
    </div>
  );
}

export const agentPlanActivityMessageUI = defineDataMessageUI<unknown>({
  name: "agui-activity/agent-plan",
  render: AgentPlanActivityMessage,
});
