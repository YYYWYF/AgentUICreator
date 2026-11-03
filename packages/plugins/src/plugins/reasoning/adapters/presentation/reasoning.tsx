import type { ComponentProps, ReactNode } from "react";
import type { ConversationMessagePartGroup } from "../../../../public.js";
import { ReasoningRoot as InternalReasoningRoot, ReasoningTrigger as InternalReasoningTrigger, ReasoningContent as InternalReasoningContent, ReasoningText as InternalReasoningText } from "../../../../plugin-support.js";
export interface ConversationCanonicalReasoningGroupProps extends Omit<ComponentProps<typeof InternalReasoningRoot>, "children" | "open" | "defaultOpen" | "onOpenChange"> { group: ConversationMessagePartGroup; children?: ReactNode; expanded?: boolean; defaultExpanded?: boolean; onExpandedChange?: (expanded: boolean) => void; buttonProps?: ComponentProps<typeof InternalReasoningTrigger>; contentProps?: Omit<ComponentProps<typeof InternalReasoningContent>, "children">; textProps?: Omit<ComponentProps<typeof InternalReasoningText>, "children">; }
export function ConversationCanonicalReasoningGroup({ group, children, expanded, defaultExpanded, onExpandedChange, buttonProps, contentProps, textProps, ...rootProps }: ConversationCanonicalReasoningGroupProps) {
  const running = group.status.type === "running";
  return (
    <InternalReasoningRoot className="mb-0" streaming={running} {...rootProps} {...(expanded === undefined ? {} : { open: expanded })} {...(defaultExpanded === undefined ? {} : { defaultOpen: defaultExpanded })} {...(onExpandedChange === undefined ? {} : { onOpenChange: onExpandedChange })}>
      <InternalReasoningTrigger active={running} {...buttonProps} />
      <InternalReasoningContent aria-busy={running} {...contentProps}>
        <InternalReasoningText {...textProps}>{children}</InternalReasoningText>
      </InternalReasoningContent>
    </InternalReasoningRoot>
  );
}

