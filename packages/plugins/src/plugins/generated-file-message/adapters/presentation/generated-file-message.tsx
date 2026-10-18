import type { ComponentProps, ComponentType, ReactNode } from "react";
import { ConversationFile, ConversationToolFallback, type ConversationToolCallProps } from "../../../../public.js";
import { projectGeneratedFileResult } from "./projection.js";
export interface GeneratedFileMessageProps extends ConversationToolCallProps {
  fileProps?: Partial<ComponentProps<typeof ConversationFile>>;
  renderFile?: (props: ComponentProps<typeof ConversationFile>, tool: ConversationToolCallProps) => ReactNode;
  Fallback?: ComponentType<ConversationToolCallProps>;
}
export function CanonicalGeneratedFileMessage({ fileProps, renderFile, Fallback = ConversationToolFallback, ...tool }: GeneratedFileMessageProps) {
  const file = projectGeneratedFileResult(tool.result);
  if (tool.status.type !== "complete" || tool.isError === true || file === null) return <Fallback {...tool} />;
  const props: ComponentProps<typeof ConversationFile> = { filename: file.filename, mimeType: file.mimeType, data: file.url, sourceType: "url", ...fileProps };
  return <>{renderFile ? renderFile(props, tool) : <ConversationFile {...props} />}</>;
}
