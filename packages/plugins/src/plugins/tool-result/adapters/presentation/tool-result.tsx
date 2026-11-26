import { ToolCallCard, type ToolCallCardProps } from './tool-call-card.js';
import { useStreamedToolResult } from '@za38.03/agent-ui-runtime/plugin-api';
export type {
  ToolCardPresentationProps,
  ToolApprovalClassNames,
  ToolApprovalStyles,
} from './tool-call-card.js';
export type { ToolResultContentProps } from './result/result-content.js';
export type { ToolResultPart, ToolResultSource } from './result/content.js';
export type {
  ToolCallRenderContext,
  ToolCallComponentProps,
  ToolResultComponents,
  ToolHeaderProps,
  ToolArgsProps,
  ToolApprovalProps,
  ApprovalCardProps,
  ToolResultProps,
  ToolErrorProps,
  ToolTextProps,
  ToolImageProps,
  ToolAudioProps,
  ToolVideoProps,
  ToolFileProps,
  ToolCallData,
  ToolCallMethods,
  ToolDefaultViews,
  ToolErrorRenderContext,
  ToolApprovalRenderContext,
  ToolApprovalRenderAction,
  ToolResultContext,
  ToolTextResultView,
  ToolMediaResultView,
} from './render-types.js';
/** Optional low-level disclosure primitives; supplied header nodes are already self-contained. */
export {
  ToolFallbackRoot as ToolCallCardRoot,
  ToolFallbackContent as ToolCallCardContent,
} from './tool-card.js';
export interface ConversationToolResultProps extends ToolCallCardProps {
  resultOnly?: boolean;
}
export function ConversationToolResult(input: ConversationToolResultProps) {
  const props = useStreamedToolResult(input);
  return <ToolCallCard {...props} structuredResults />;
}
