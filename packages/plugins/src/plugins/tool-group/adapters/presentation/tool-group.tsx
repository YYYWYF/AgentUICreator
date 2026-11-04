import type { ComponentProps, ReactNode } from 'react';
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
  buttonProps?: Partial<ComponentProps<typeof InternalToolGroupTrigger>>;
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
  return (
    <InternalToolGroupRoot
      variant='ghost'
      data-agent-state={group.status.type === 'running' ? 'running' : 'idle'}
      {...rootProps}
      {...(expanded === undefined ? {} : { open: expanded })}
      {...(defaultExpanded === undefined ? {} : { defaultOpen: defaultExpanded })}
      {...(onExpandedChange === undefined ? {} : { onOpenChange: onExpandedChange })}
    >
      <InternalToolGroupTrigger
        count={group.indices.length}
        active={group.status.type === 'running'}
        {...buttonProps}
      />
      <InternalToolGroupContent {...contentProps}>{children}</InternalToolGroupContent>
    </InternalToolGroupRoot>
  );
}
