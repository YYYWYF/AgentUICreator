import type { ComponentProps, ReactNode } from 'react';
import { AgentPlan, type DataMessageUIRenderProps, type UIPluginElementProps } from '../../../../public.js';
import { projectAgentPlanActivity } from './projection.js';
export interface AgentPlanMessageProps extends DataMessageUIRenderProps<unknown>, UIPluginElementProps {
  title?: ComponentProps<typeof AgentPlan>['title'];
  steps?: ComponentProps<typeof AgentPlan>['steps'];
  activeIndex?: ComponentProps<typeof AgentPlan>['activeIndex'];
  renderPlan?: (props: ComponentProps<typeof AgentPlan>) => ReactNode;
}
export function CanonicalAgentPlanMessage({
  data,
  title,
  steps,
  activeIndex,
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
  const overrides = Object.fromEntries(
    Object.entries({ title, steps, activeIndex }).filter(([, value]) => value !== undefined),
  );
  const plan = projectAgentPlanActivity(data);
  if (plan === null) {
    return null;
  }
  const props: ComponentProps<typeof AgentPlan> = { ...plan, ...overrides };
  return (
    <div data-agent-ui-composition-part='plan' {...rootProps}>
      {renderPlan ? renderPlan(props) : <AgentPlan {...props} />}
    </div>
  );
}
