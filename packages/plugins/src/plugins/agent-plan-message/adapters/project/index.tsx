import { CanonicalAgentPlanMessage, defineDataMessageUI } from "@za38.03/agent-ui-plugins";
export const agentPlanActivityMessageUI = defineDataMessageUI<unknown>({
  name: "agui-activity/agent-plan",
  render: CanonicalAgentPlanMessage,
});
