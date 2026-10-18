import { CanonicalJobProgressMessage, type JobProgressMessageProps } from "@za38.03/agent-ui-plugins";
export function JobProgressMessagePlugin(props: JobProgressMessageProps) {
  return <CanonicalJobProgressMessage {...props} />;
}
