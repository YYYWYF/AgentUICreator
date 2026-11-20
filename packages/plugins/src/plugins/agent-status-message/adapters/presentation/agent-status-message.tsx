import type { ComponentProps, ComponentType, ReactNode } from 'react';
import {
  AgentStatus,
  ConversationToolResult,
  type ConversationToolCallProps,
  type UIPluginElementProps,
} from '../../../../public.js';
import { projectAgentStatus } from './projection.js';
export interface AgentStatusMessageProps extends ConversationToolCallProps, UIPluginElementProps {
  renderStatus?: (props: ComponentProps<typeof AgentStatus>, tool: ConversationToolCallProps) => ReactNode;
  Fallback?: ComponentType<ConversationToolCallProps>;
}
export function CanonicalAgentStatusMessage({
  className,
  style,
  id,
  role,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescription,
  onClick,
  renderStatus,
  Fallback = ConversationToolResult,
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
  const view = projectAgentStatus(tool.args, tool.status);
  if (tool.isError === true || tool.status.type === 'incomplete' || view === null) {
    return <Fallback {...tool} />;
  }
  return (
    <div data-agent-ui-composition-part='status' {...rootProps}>
      {renderStatus ? renderStatus(view, tool) : <AgentStatus {...view} />}
    </div>
  );
}
