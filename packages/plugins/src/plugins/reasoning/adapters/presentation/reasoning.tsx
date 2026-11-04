import type { ComponentProps, ReactNode } from 'react';
import {
  ReasoningContent as InternalReasoningContent,
  ReasoningRoot as InternalReasoningRoot,
  ReasoningText as InternalReasoningText,
  ReasoningTrigger as InternalReasoningTrigger,
} from '../../../../plugin-support.js';
import type { ConversationMessagePartGroup } from '../../../../public.js';
export interface ConversationCanonicalReasoningGroupProps
  extends Omit<ComponentProps<typeof InternalReasoningRoot>, 'children' | 'open' | 'defaultOpen' | 'onOpenChange'> {
  group: ConversationMessagePartGroup;
  children?: ReactNode;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  buttonProps?: ComponentProps<typeof InternalReasoningTrigger>;
  contentProps?: Omit<ComponentProps<typeof InternalReasoningContent>, 'children'>;
  textProps?: Omit<ComponentProps<typeof InternalReasoningText>, 'children'>;
}
export function ConversationCanonicalReasoningGroup({
  group,
  children,
  expanded,
  defaultExpanded,
  onExpandedChange,
  buttonProps,
  contentProps,
  textProps,
  ...rootProps
}: ConversationCanonicalReasoningGroupProps) {
  const running = group.status.type === 'running';
  return (
    <InternalReasoningRoot
      className='mb-0'
      streaming={running}
      {...rootProps}
      {...(expanded === undefined ? {} : { open: expanded })}
      {...(defaultExpanded === undefined ? {} : { defaultOpen: defaultExpanded })}
      {...(onExpandedChange === undefined ? {} : { onOpenChange: onExpandedChange })}
    >
      <InternalReasoningTrigger active={running} {...buttonProps} />
      <InternalReasoningContent aria-busy={running} {...contentProps}>
        <InternalReasoningText {...textProps}>{children}</InternalReasoningText>
      </InternalReasoningContent>
    </InternalReasoningRoot>
  );
}
