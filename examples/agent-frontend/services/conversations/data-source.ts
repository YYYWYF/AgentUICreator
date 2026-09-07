import type { ConversationDetail, ConversationSummary } from "./contract";

export const AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE =
  "agent-ui.conversation-data-source";

export interface ConversationDataSourceOptions {
  signal?: AbortSignal | undefined;
}

export interface ConversationDataSource {
  list(options?: ConversationDataSourceOptions): Promise<ConversationSummary[]>;
  get(
    id: string,
    options?: ConversationDataSourceOptions,
  ): Promise<ConversationDetail>;
}

const unavailableMessage = "Conversation API endpoint is not configured.";

export function createUnavailableConversationDataSource(): ConversationDataSource {
  return {
    list: async () => Promise.reject(new Error(unavailableMessage)),
    get: async () => Promise.reject(new Error(unavailableMessage)),
  };
}

declare module "../../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap {
    [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE]: ConversationDataSource;
  }
}
