import type { ComponentProps, ComponentType, ReactNode } from 'react';
import {
  ConversationFile,
  ConversationToolFallback,
  type ConversationToolCallProps,
  type UIPluginElementProps,
} from '../../../../public.js';
import { projectGeneratedFileResult } from './projection.js';
export interface GeneratedFileMessageProps extends ConversationToolCallProps, UIPluginElementProps {
  filename?: ComponentProps<typeof ConversationFile>['filename'];
  mimeType?: ComponentProps<typeof ConversationFile>['mimeType'];
  data?: ComponentProps<typeof ConversationFile>['data'];
  sourceType?: ComponentProps<typeof ConversationFile>['sourceType'];
  renderFile?: (props: ComponentProps<typeof ConversationFile>, tool: ConversationToolCallProps) => ReactNode;
  Fallback?: ComponentType<ConversationToolCallProps>;
}
export function CanonicalGeneratedFileMessage({
  filename,
  mimeType,
  data,
  sourceType,
  className,
  style,
  id,
  role,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescription,
  onClick,
  renderFile,
  Fallback = ConversationToolFallback,
  ...tool
}: GeneratedFileMessageProps) {
  const rootProps = {
    className,
    style,
    id,
    role,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescription,
    onClick,
  };
  const overrides = Object.fromEntries(
    Object.entries({ filename, mimeType, data, sourceType }).filter(([, value]) => value !== undefined),
  );
  const file = projectGeneratedFileResult(tool.result);
  if (tool.status.type !== 'complete' || tool.isError === true || file === null) {
    return <Fallback {...tool} />;
  }
  const props: ComponentProps<typeof ConversationFile> = {
    filename: file.filename,
    mimeType: file.mimeType,
    data: file.url,
    sourceType: 'url',
    ...overrides,
  };
  return <div {...rootProps}>{renderFile ? renderFile(props, tool) : <ConversationFile {...props} />}</div>;
}
