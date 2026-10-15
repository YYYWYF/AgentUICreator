import {
  ConversationFile,
  ConversationToolFallback,
  type ConversationToolCallComponent,
} from "@za38.03/agent-ui-plugins";
import { projectGeneratedFileResult } from "./generated-file-result";

export const GenerateFileToolUI: ConversationToolCallComponent = (props) => {
  if (props.status.type !== "complete" || props.isError === true) {
    return <ConversationToolFallback {...props} />;
  }
  const file = projectGeneratedFileResult(props.result);
  if (file === null) return <ConversationToolFallback {...props} />;
  return <ConversationFile filename={file.filename} mimeType={file.mimeType} data={file.url} sourceType="url" />;
};
