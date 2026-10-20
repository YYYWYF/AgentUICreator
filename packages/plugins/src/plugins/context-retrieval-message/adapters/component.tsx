import "./style.css";
import { CanonicalContextRetrievalMessage, type ContextRetrievalMessageProps } from "@za38.03/agent-ui-plugins";

export function ContextRetrievalMessagePlugin(props: ContextRetrievalMessageProps) {
  return <CanonicalContextRetrievalMessage {...props} />;
}
