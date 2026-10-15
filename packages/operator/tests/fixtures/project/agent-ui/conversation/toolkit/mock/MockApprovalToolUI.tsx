import {
  ConversationToolFallback,
  type ConversationToolCallComponent,
} from "@za38.03/agent-ui-react";

/** Uses the official assistant-ui approval presentation for the mock HITL tool. */
export const MockApprovalToolUI: ConversationToolCallComponent = (props) => (
  <ConversationToolFallback {...props} />
);
