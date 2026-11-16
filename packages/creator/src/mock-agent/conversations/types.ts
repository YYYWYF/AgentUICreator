export interface ConversationSummary {
  id: string;
  title: string;
  status?: "regular" | "archived" | undefined;
  group?: string | undefined;
  updatedAt?: string | undefined;
  disabled?: boolean | undefined;
}

export interface ConversationDetail {
  id: string;
  title: string;
  history: {
    format: "langchain";
    messages: readonly unknown[];
  };
  agentState?: unknown;
}

