import { ToolCallCard, type ToolCallCardProps } from './tool-call-card.js';
import { ToolResultContent, type ToolResultContentProps } from './result/result-content.js';
import { hasToolResultParts } from './result/content.js';
export type { ToolCardPresentationProps, ToolApprovalClassNames, ToolApprovalStyles } from './tool-call-card.js';
export type { ToolResultContentProps } from './result/result-content.js';
export type { ToolResultPart, ToolResultSource } from './result/content.js';

export interface ConversationToolResultProps extends ToolCallCardProps, Omit<ToolResultContentProps, 'result'> {
  resultOnly?: boolean;
}
export function ConversationToolResult({
  resolveFile,
  renderPart,
  resultOnly,
  className,
  style,
  id,
  role,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescription,
  onClick,
  ...tool
}: ConversationToolResultProps) {
  const appearance = {
    className,
    style,
    id,
    role,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescription,
    onClick,
  };
  const content = (
    <ToolResultContent
      result={tool.result}
      {...(resolveFile ? { resolveFile } : {})}
      {...(renderPart ? { renderPart } : {})}
    />
  );
  if (resultOnly) {
    return <div {...appearance}>{content}</div>;
  }
  if (!hasToolResultParts(tool.result)) {
    return <ToolCallCard {...tool} {...appearance} />;
  }
  return (
    <div
      {...appearance}
      data-agent-ui-owned=''
      data-slot='tool-result'
      className={['flex min-w-0 max-w-full flex-col gap-3', className].filter(Boolean).join(' ')}
    >
      <ToolCallCard {...tool} renderResult={() => null} />
      {content}
    </div>
  );
}
