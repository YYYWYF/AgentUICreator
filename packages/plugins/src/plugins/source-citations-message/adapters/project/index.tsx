import { CanonicalSourceCitationsMessage, type SourceCitationsMessageProps } from "@za38.03/agent-ui-plugins";
/** Compatibility entry; shared Runtime and presentation have one owner. */
export function SearchSourcesToolUI(props: SourceCitationsMessageProps) {
  return <CanonicalSourceCitationsMessage {...props} />;
}
