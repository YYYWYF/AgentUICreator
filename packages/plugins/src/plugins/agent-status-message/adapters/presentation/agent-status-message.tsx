import type { ComponentProps, ComponentType, ReactNode } from 'react';
import {
  AgentStatus,
  ConversationToolFallback,
  type ConversationToolCallProps,
  type UIPluginElementProps,
} from '../../../../public.js';
import { projectAgentStatus } from './projection.js';
export interface AgentStatusMessageProps extends ConversationToolCallProps, UIPluginElementProps {
  label?: ComponentProps<typeof AgentStatus>['label'];
  elapsed?: ComponentProps<typeof AgentStatus>['elapsed'];
  state?: ComponentProps<typeof AgentStatus>['state'];
  renderStatus?: (props: ComponentProps<typeof AgentStatus>, tool: ConversationToolCallProps) => ReactNode;
  Fallback?: ComponentType<ConversationToolCallProps>;
}
export function CanonicalAgentStatusMessage({
  label,
  elapsed,
  state,
  className,
  style,
  id,
  role,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescription,
  onClick,
  renderStatus,
  Fallback = ConversationToolFallback,
  ...tool
}: AgentStatusMessageProps) {
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
    Object.entries({ label, elapsed, state }).filter(([, value]) => value !== undefined),
  );
  const view = projectAgentStatus(tool.args, tool.status);
  if (tool.isError === true || tool.status.type === 'incomplete' || view === null) {
    return <Fallback {...tool} />;
  }
  const props = { ...view, ...overrides };
  return (
    <div data-agent-ui-composition-part='status' {...rootProps}>
      {renderStatus ? renderStatus(props, tool) : <AgentStatus {...props} />}
    </div>
  );
}
