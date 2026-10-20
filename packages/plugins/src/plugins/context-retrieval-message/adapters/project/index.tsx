import "./style.css";
import { CanonicalContextRetrievalMessage, type ContextRetrievalMessageProps } from "@za38.03/agent-ui-plugins";

/** Compatibility entry; shared Runtime and presentation have one owner. */
export function ContextRetrievalMessagePlugin(props: ContextRetrievalMessageProps) {
  return <CanonicalContextRetrievalMessage {...props} />;
}
