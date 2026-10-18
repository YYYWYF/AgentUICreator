import { CanonicalGeneratedFileMessage, type GeneratedFileMessageProps } from "@za38.03/agent-ui-plugins";
/** Compatibility entry for the original generated-file resource. */
export function GenerateFileToolUI(props: GeneratedFileMessageProps) {
  return <CanonicalGeneratedFileMessage {...props} />;
}
