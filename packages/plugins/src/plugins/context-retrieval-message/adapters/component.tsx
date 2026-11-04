import { CanonicalContextRetrievalMessage, type ContextRetrievalMessageProps } from '@za38.03/agent-ui-plugins';
import './style.css';

export function ContextRetrievalMessagePlugin(props: ContextRetrievalMessageProps) {
  return <CanonicalContextRetrievalMessage {...props} />;
}
