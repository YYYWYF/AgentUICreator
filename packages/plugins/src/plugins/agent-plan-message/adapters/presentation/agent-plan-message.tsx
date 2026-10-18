import type { ComponentProps, ReactNode } from "react";
import { AgentPlan, type DataMessageUIRenderProps } from "../../../../public.js";
import { projectAgentPlanActivity } from "./projection.js";
export interface AgentPlanMessageProps extends DataMessageUIRenderProps<unknown> {
  rootProps?: Omit<ComponentProps<"div">, "children">;
  planProps?: Partial<ComponentProps<typeof AgentPlan>>;
  renderPlan?: (props: ComponentProps<typeof AgentPlan>) => ReactNode;
}
export function CanonicalAgentPlanMessage({ data, rootProps, planProps, renderPlan }: AgentPlanMessageProps) {
  const plan = projectAgentPlanActivity(data);
  if (plan === null) return null;
  const props = { ...plan, ...planProps };
  return <div data-agent-ui-composition-part="plan" {...rootProps}>{renderPlan ? renderPlan(props) : <AgentPlan {...props} />}</div>;
}
