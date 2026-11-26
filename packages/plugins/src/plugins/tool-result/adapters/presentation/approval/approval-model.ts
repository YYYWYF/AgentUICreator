'use client';

import type { ConversationCommandDecisionRequest, ConversationToolCallProps } from '../../../../../public.js';
import {
  DEFAULT_AGENT_UI_MESSAGES,
  type ToolApprovalOption,
  type ToolCallMessagePart,
  type ToolCallMessagePartProps,
  type ToolCallMessagePartStatus,
} from '../../../../../plugin-support.js';

// These affect presentation only; approval handlers and permissions stay internal.
/** Action row, every action button, and the explicit approve/reject buttons. */
export type ToolApprovalClassNames = Partial<Record<'actions' | 'button' | 'approveButton' | 'rejectButton', string>>;
export type ToolApprovalStyles = Partial<Record<keyof ToolApprovalClassNames, React.CSSProperties>>;
export interface ToolFallbackApprovalAppearance {
  /** Changes presentation without replacing approval callbacks or permissions. */
  approvalClassNames?: ToolApprovalClassNames | undefined;
  /** Per-action styles override common button styles. */
  approvalStyles?: ToolApprovalStyles | undefined;
}

export const APPROVED_RESULT = 'Approved by user';
export const DENIED_RESULT = 'User denied tool execution';

const APPROVAL_OPTION_DEFAULT_LABELS: Record<string, string> = {
  'allow-once': 'Allow',
  'allow-always': 'Always allow',
  'reject-once': 'Deny',
  'reject-always': 'Always deny',
};

export const isKnownKind = (kind: string) => Object.hasOwn(APPROVAL_OPTION_DEFAULT_LABELS, kind);

export const isAllowKind = (kind: string) => kind === 'allow-once' || kind === 'allow-always';

export const approvalOptionLabel = (
  option: ToolApprovalOption,
  messages = DEFAULT_AGENT_UI_MESSAGES.toolPresentation,
) =>
  option.label ??
  (isKnownKind(option.kind)
    ? (
        {
          'allow-once': messages.allow,
          'allow-always': messages.alwaysAllow,
          'reject-once': messages.deny,
          'reject-always': messages.alwaysDeny,
        } as Record<string, string>
      )[option.kind]
    : undefined) ??
  option.id;

export const isSettled = (approval: ToolCallMessagePart['approval']) =>
  approval != null && (approval.approved !== undefined || approval.resolution !== undefined);

export type ApprovalReceipt = {
  outcome: 'allowed' | 'refused' | 'closed';
  label: string;
  option?: string | undefined;
};

/**
 * A settled request reads as a past-tense record of what happened to it, so
 * scrolling back never shows a live control for a decision already made.
 */
export const approvalReceipt = (
  approval: NonNullable<ToolCallMessagePart['approval']>,
  messages = DEFAULT_AGENT_UI_MESSAGES.toolPresentation,
): ApprovalReceipt => {
  if (approval.resolution !== undefined) {
    return {
      outcome: 'closed',
      label: approval.resolution === 'cancelled' ? messages.cancelledDecision : messages.expiredDecision,
    };
  }

  const chosen =
    approval.optionId === undefined ? undefined : approval.options?.find((option) => option.id === approval.optionId);
  const option =
    chosen !== undefined
      ? approvalOptionLabel(chosen, messages)
      : approval.optionId === undefined
        ? undefined
        : approval.optionId;
  const answered = chosen !== undefined && !isKnownKind(chosen.kind);
  const automatic = approval.isAutomatic ? messages.automatic : '';

  if (approval.approved) {
    return {
      outcome: 'allowed',
      label: `${answered ? messages.answered : messages.allowed}${automatic}`,
      option,
    };
  }
  return {
    outcome: 'refused',
    label: `${answered ? messages.dismissed : messages.denied}${automatic}`,
    option,
  };
};

export const offersInterruptAction = (
  status: ToolCallMessagePartStatus | undefined,
  approval: ToolCallMessagePart['approval'],
  interrupt: ToolCallMessagePart['interrupt'],
  decisionRequest?: ConversationCommandDecisionRequest,
) =>
  decisionRequest !== undefined ||
  status?.type !== 'requires-action' ||
  status.reason !== 'interrupt' ||
  approval != null ||
  interrupt != null;

export type ToolFallbackApprovalProps = React.ComponentPropsWithoutRef<'div'> &
  ToolFallbackApprovalAppearance &
  { [Key in 'addResult' | 'resume' | 'respondToApproval' | 'status']?: ToolCallMessagePartProps<unknown, unknown>[Key] | undefined } & {
    tool?: Readonly<ConversationToolCallProps> | undefined;
    interrupt?: ToolCallMessagePart['interrupt'];
    approval?: ToolCallMessagePart['approval'];
    decisionRequest?: ConversationCommandDecisionRequest | undefined;
    submitDecision?: ConversationToolCallProps['submitDecision'] | undefined;
    resumeInterrupt?: ConversationToolCallProps['resumeInterrupt'] | undefined;
    commandRecord?: {
      request: ConversationCommandDecisionRequest;
      pending: boolean;
      decision?: string | undefined;
    } | undefined;
  };
