import {
  ConversationSource,
  ConversationToolFallback,
  type ConversationToolCallComponent,
} from "@agent-ui/react";
import { projectSourceCitationsResult } from "./source-citations-result";

export const SearchSourcesToolUI: ConversationToolCallComponent = (props) => {
  if (props.status.type !== "complete" || props.isError === true) {
    return <ConversationToolFallback {...props} />;
  }
  const sources = projectSourceCitationsResult(props.result);
  if (sources === null) return <ConversationToolFallback {...props} />;
  return <>{sources.map(source => <ConversationSource key={source.id} {...source} />)}</>;
};
