import type { ComponentProps, ReactNode } from "react";
import type { ConversationMessagePartGroup } from "../../../../public.js";
import { ReasoningRoot as InternalReasoningRoot, ReasoningTrigger as InternalReasoningTrigger, ReasoningContent as InternalReasoningContent, ReasoningText as InternalReasoningText } from "../../../../plugin-support.js";
export interface ConversationCanonicalReasoningGroupProps { group: ConversationMessagePartGroup; children?: ReactNode; rootProps?: Omit<ComponentProps<typeof InternalReasoningRoot>, "children">; triggerProps?: ComponentProps<typeof InternalReasoningTrigger>; contentProps?: Omit<ComponentProps<typeof InternalReasoningContent>, "children">; textProps?: Omit<ComponentProps<typeof InternalReasoningText>, "children">; }
export function ConversationCanonicalReasoningGroup({ group, children, rootProps, triggerProps, contentProps, textProps }: ConversationCanonicalReasoningGroupProps) {
  const running = group.status.type === "running";
  return (
    <InternalReasoningRoot className="mb-0" streaming={running} {...rootProps}>
      <InternalReasoningTrigger active={running} {...triggerProps} />
      <InternalReasoningContent aria-busy={running} {...contentProps}>
        <InternalReasoningText {...textProps}>{children}</InternalReasoningText>
      </InternalReasoningContent>
    </InternalReasoningRoot>
  );
}

