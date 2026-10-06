/** Application persistence contract; independent of the Agent inference protocol. */
export interface ConversationFeedbackSubmission {
  threadId: string;
  messageId: string;
  type: "positive" | "negative";
  comment?: string;
}

export interface ConversationFeedbackAdapter {
  submit(feedback: ConversationFeedbackSubmission): void | Promise<void>;
}
