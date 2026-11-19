import type { ComponentProps, ReactNode } from 'react';
import { AgentPlan, type DataMessageUIRenderProps, type UIPluginElementProps } from '../../../../public.js';
import { projectAgentPlanActivity } from './projection.js';
export interface AgentPlanMessageProps extends DataMessageUIRenderProps<unknown>, UIPluginElementProps {
  renderPlan?: (props: ComponentProps<typeof AgentPlan>) => ReactNode;
}
export function CanonicalAgentPlanMessage({
  data,
  className,
  style,
  id,
  role,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescription,
  onClick,
  renderPlan,
}: AgentPlanMessageProps) {
  const rootProps = {
    className,
    style,
    id,
    role,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescription,
    onClick,
  };
  const plan = projectAgentPlanActivity(data);
  if (plan === null) {
    return null;
  }
  return (
    <div data-agent-ui-composition-part='plan' {...rootProps}>
      {renderPlan ? renderPlan(plan) : <AgentPlan {...plan} />}
    </div>
  );
}
