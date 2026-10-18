import type { ComponentProps, ComponentType, ReactNode } from "react";
import { AgentStatus, ConversationToolFallback, type ConversationToolCallProps } from "../../../../public.js";
import { projectAgentStatus } from "./projection.js";
export interface AgentStatusMessageProps extends ConversationToolCallProps {
  rootProps?: Omit<ComponentProps<"div">, "children">;
  statusProps?: Partial<ComponentProps<typeof AgentStatus>>;
  renderStatus?: (props: ComponentProps<typeof AgentStatus>, tool: ConversationToolCallProps) => ReactNode;
  Fallback?: ComponentType<ConversationToolCallProps>;
}
export function CanonicalAgentStatusMessage({ rootProps, statusProps, renderStatus, Fallback = ConversationToolFallback, ...tool }: AgentStatusMessageProps) {
  const view = projectAgentStatus(tool.args, tool.status);
  if (tool.isError === true || tool.status.type === "incomplete" || view === null) return <Fallback {...tool} />;
  const props = { ...view, ...statusProps };
  return <div data-agent-ui-composition-part="status" {...rootProps}>{renderStatus ? renderStatus(props, tool) : <AgentStatus {...props} />}</div>;
}
