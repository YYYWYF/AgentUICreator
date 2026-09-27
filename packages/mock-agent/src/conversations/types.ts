export interface ConversationSummary {
  id: string;
  title: string;
  group?: string | undefined;
  updatedAt?: string | undefined;
  disabled?: boolean | undefined;
}

export interface LangGraphStateSnapshotDto {
  values: {
    messages?: unknown[] | undefined;
    [key: string]: unknown;
  };
  next?: unknown;
  metadata?: unknown;
  createdAt?: string | undefined;
  tasks?: unknown[] | undefined;
}

export interface ConversationDetailResponse {
  id: string;
  title: string;
  state: LangGraphStateSnapshotDto;
  /** Explicit AG-UI application state; never inferred from state.values. */
  agentState?: unknown;
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

export interface ConversationListResponse {
  conversations: ConversationSummary[];
}

