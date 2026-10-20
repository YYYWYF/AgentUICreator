import { AgentPlanMessagePlugin as Implementation } from "@za38.03/agent-ui-plugins/agent-plan-message";
import type { ComponentProps } from "react";

export function AgentPlanMessagePlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
