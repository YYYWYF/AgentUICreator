import type { ComponentPropsWithRef, ComponentType, ReactNode } from 'react';
import type {
  ConversationCommandDecisionRequest,
  ConversationToolCallProps,
} from '../../../../public.js';
import type {
  ToolApprovalOption,
  ToolCallMessagePart,
  ToolCallMessagePartProps,
  ToolCallMessagePartStatus,
} from '../../../../plugin-support.js';
import type { ApprovalReceipt } from './approval/approval-model.js';
import type { ToolResultPart } from './result/content.js';

type NativeTool = ToolCallMessagePartProps<unknown, unknown>;
export type ToolCallInput = Readonly<
  Pick<
    ConversationToolCallProps,
    | 'type'
    | 'toolCallId'
    | 'toolName'
    | 'args'
    | 'argsText'
    | 'result'
    | 'status'
    | 'isPreliminary'
    | 'messages'
    | 'isError'
    | 'addResult'
    | 'resumeInterrupt'
    | 'decisionRequest'
    | 'submitDecision'
  >
> &
  Partial<
    Pick<
      NativeTool,
      | 'approval'
      | 'respondToApproval'
      | 'interrupt'
      | 'resume'
      | 'responseDeliveryStatus'
      | 'unstable_recordInteraction'
      | 'artifact'
      | 'timing'
      | 'mcp'
      | 'providerMetadata'
      | 'modelContent'
      | 'parentId'
      | 'unstable_interactions'
    >
  >;
export type ToolCallData = Readonly<
  Pick<
    ConversationToolCallProps,
    | 'toolCallId'
    | 'toolName'
    | 'args'
    | 'argsText'
    | 'result'
    | 'status'
    | 'isError'
    | 'isPreliminary'
    | 'messages'
    | 'decisionRequest'
  > &
    Pick<
      ToolCallInput,
      | 'approval'
      | 'interrupt'
      | 'responseDeliveryStatus'
      | 'artifact'
      | 'timing'
      | 'mcp'
      | 'providerMetadata'
      | 'modelContent'
      | 'parentId'
      | 'unstable_interactions'
    >
>;
export type ToolCallMethods = Readonly<
  Partial<
    Pick<
      NativeTool,
      | 'addResult'
      | 'respondToApproval'
      | 'resume'
      | 'unstable_recordInteraction'
    > &
      Pick<ConversationToolCallProps, 'resumeInterrupt' | 'submitDecision'>
  >
>;
/** Complete, independently usable invocation summary: title, status and arguments. */
export interface ToolCallRenderContext {
  readonly header: ReactNode;
  /** Default body only: errors, approval and results. Never includes header. */
  readonly defaultView: ReactNode;
}
export interface ToolDefaultViews {
  readonly header: ReactNode;
  readonly args: ReactNode;
  readonly approval: ReactNode;
  readonly result: ReactNode;
  readonly error: ReactNode;
}
export interface ToolCallComponentProps {
  readonly tool: ToolCallData;
  readonly methods: ToolCallMethods;
  readonly approval: ToolApprovalRenderContext | undefined;
  readonly result: ToolResultContext;
  readonly error: ToolErrorRenderContext | undefined;
}
export interface ToolHeaderProps extends ToolCallComponentProps {
  readonly expanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly defaultView: ReactNode;
}
export interface ToolArgsProps extends ToolCallComponentProps {
  readonly args: unknown;
  readonly argsText: string | undefined;
  readonly defaultView: ReactNode;
}
export interface ToolApprovalProps extends ToolCallComponentProps {
  readonly approval: ToolApprovalRenderContext;
  readonly defaultView: ReactNode;
}
export interface ApprovalCardProps
  extends ToolApprovalProps,
    ToolCallRenderContext {
  readonly views: ToolDefaultViews;
  readonly expanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
}
export interface ToolResultProps extends ToolCallComponentProps {
  readonly defaultView: ReactNode;
}
export interface ToolErrorProps extends ToolCallComponentProps {
  readonly error: ToolErrorRenderContext;
  readonly defaultView: ReactNode;
}
export interface ToolTextProps {
  readonly value: unknown;
  readonly text: string;
  readonly part?: Extract<ToolResultPart, { type: 'text' }>;
  readonly index?: number;
  readonly defaultView: ReactNode;
}
type MediaProps<Type extends 'image' | 'audio' | 'video' | 'document'> = Omit<
  ToolMediaResultView,
  'part' | 'url'
> & {
  readonly part: Exclude<ToolResultPart, { type: 'text' }> & { type: Type };
  /** Resolved and validated source. Loading/unavailable states use the default view. */
  readonly src: string;
};
export type ToolImageProps = MediaProps<'image'>;
export type ToolAudioProps = MediaProps<'audio'>;
export type ToolVideoProps = MediaProps<'video'>;
export type ToolFileProps = MediaProps<'document'>;
export interface ToolResultComponents {
  readonly Header?: ComponentType<ToolHeaderProps>;
  readonly Args?: ComponentType<ToolArgsProps>;
  readonly Approval?: ComponentType<ToolApprovalProps>;
  readonly ApprovalCard?: ComponentType<ApprovalCardProps>;
  readonly Result?: ComponentType<ToolResultProps>;
  readonly Error?: ComponentType<ToolErrorProps>;
  readonly Text?: ComponentType<ToolTextProps>;
  readonly Image?: ComponentType<ToolImageProps>;
  readonly Audio?: ComponentType<ToolAudioProps>;
  readonly Video?: ComponentType<ToolVideoProps>;
  readonly File?: ComponentType<ToolFileProps>;
}
export interface ToolErrorRenderContext {
  readonly status: Extract<ToolCallMessagePartStatus, { type: 'incomplete' }>;
  readonly error: unknown;
  readonly errorText: string;
  readonly cancelled: boolean;
}
export interface ToolApprovalRenderAction {
  readonly id: string;
  readonly label: string;
  readonly kind: 'approve' | 'reject' | 'custom' | 'confirm' | 'back';
  readonly disabled: boolean;
}
export interface ToolApprovalRenderContext {
  readonly kind: 'command' | 'approval' | 'interrupt' | 'frontend';
  readonly phase:
    | 'pending'
    | 'confirming'
    | 'submitting'
    | 'settled'
    | 'readonly';
  readonly prompt: string | undefined;
  readonly approval: ToolCallMessagePart['approval'];
  readonly interrupt: ToolCallMessagePart['interrupt'];
  readonly decisionRequest: ConversationCommandDecisionRequest | undefined;
  readonly options: readonly ToolApprovalOption[];
  readonly confirming: ToolApprovalOption | undefined;
  readonly receipt: Readonly<ApprovalReceipt> | undefined;
  readonly disabled: boolean;
  readonly error: string | null;
  readonly acceptsNote: boolean;
  readonly note: string;
  readonly setNote: (note: string) => void;
  /** Approve the request, or choose an approval option by id. Repeating confirms a pending confirmation. */
  readonly approve: (optionId?: string) => void;
  /** Reject the request, or choose a rejection option by id. Repeating confirms a pending confirmation. */
  readonly reject: (optionId?: string) => void;
  readonly actions: readonly ToolApprovalRenderAction[];
  /** Attach to a div containing custom controls to retain focus handling. */
  readonly containerProps: Pick<
    ComponentPropsWithRef<'div'>,
    'ref' | 'tabIndex'
  >;
}
export interface ToolTextResultView {
  readonly part: Extract<ToolResultPart, { type: 'text' }>;
  readonly index: number;
  readonly text: string;
  readonly defaultView: ReactNode;
}
export interface ToolMediaResultView {
  readonly part: Exclude<ToolResultPart, { type: 'text' }>;
  readonly index: number;
  readonly url: string | undefined;
  readonly mimeType: string;
  readonly filename: string | undefined;
  readonly pending: boolean;
  readonly available: boolean;
  readonly defaultView: ReactNode;
}
export interface ToolResultContext {
  readonly kind: 'none' | 'plain' | 'parts';
  readonly value: unknown;
  readonly text: string;
  readonly parts: readonly (ToolTextResultView | ToolMediaResultView)[];
}
