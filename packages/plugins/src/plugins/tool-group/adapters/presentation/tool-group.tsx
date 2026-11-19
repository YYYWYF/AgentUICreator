import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ToolGroupContent as InternalToolGroupContent,
  ToolGroupRoot as InternalToolGroupRoot,
  ToolGroupTrigger as InternalToolGroupTrigger,
} from '../../../../plugin-support.js';
import type { ConversationMessagePartGroup } from '../../../../public.js';
export interface ConversationCanonicalToolGroupProps
  extends Omit<ComponentProps<typeof InternalToolGroupRoot>, 'children' | 'open' | 'defaultOpen' | 'onOpenChange'> {
  group: ConversationMessagePartGroup;
  children?: ReactNode;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  buttonProps?: Partial<Omit<ComponentProps<typeof InternalToolGroupTrigger>, 'active' | 'count' | 'children'>>;
  contentProps?: Omit<ComponentProps<typeof InternalToolGroupContent>, 'children'>;
}
export function ConversationCanonicalToolGroup({
  group,
  children,
  expanded,
  defaultExpanded,
  onExpandedChange,
  buttonProps,
  contentProps,
  ...rootProps
}: ConversationCanonicalToolGroupProps) {
  const requiresAction = group.requiresAction ?? group.status.type === 'requires-action';
  const [open, setOpen] = useState(defaultExpanded ?? requiresAction);
  const [previousRequiresAction, setPreviousRequiresAction] = useState(requiresAction);
  if (requiresAction !== previousRequiresAction) {
    setPreviousRequiresAction(requiresAction);
    if (requiresAction) setOpen(true);
  }

  return (
    <InternalToolGroupRoot
      variant='ghost'
      data-agent-state={group.status.type === 'running' ? 'running' : 'idle'}
      {...rootProps}
      open={expanded ?? open}
      onOpenChange={(value) => {
        setOpen(value);
        onExpandedChange?.(value);
      }}
    >
      <InternalToolGroupTrigger
        {...buttonProps}
        count={group.indices.length}
        active={group.status.type === 'running'}
      />
      <InternalToolGroupContent {...contentProps}>{children}</InternalToolGroupContent>
    </InternalToolGroupRoot>
  );
}
