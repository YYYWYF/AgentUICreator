import type { ComponentProps, ReactNode } from "react";
import type { ConversationMessagePartGroup } from "../../../../public.js";
import { ToolGroupRoot as InternalToolGroupRoot, ToolGroupTrigger as InternalToolGroupTrigger, ToolGroupContent as InternalToolGroupContent } from "../../../../plugin-support.js";
export interface ConversationCanonicalToolGroupProps { group: ConversationMessagePartGroup; children?: ReactNode; rootProps?: Omit<ComponentProps<typeof InternalToolGroupRoot>, "children">; triggerProps?: Partial<ComponentProps<typeof InternalToolGroupTrigger>>; contentProps?: Omit<ComponentProps<typeof InternalToolGroupContent>, "children">; }
export function ConversationCanonicalToolGroup({ group, children, rootProps, triggerProps, contentProps }: ConversationCanonicalToolGroupProps) {
  return (
    <InternalToolGroupRoot variant="ghost" data-agent-state={group.status.type === "running" ? "running" : "idle"} {...rootProps}>
      <InternalToolGroupTrigger count={group.indices.length} active={group.status.type === "running"} {...triggerProps} />
      <InternalToolGroupContent {...contentProps}>{children}</InternalToolGroupContent>
    </InternalToolGroupRoot>
  );
}

