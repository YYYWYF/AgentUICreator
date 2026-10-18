import type { ConversationDetail, ConversationSummary } from "./contract";

export const AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE =
  "agent-ui.conversation-data-source";

export interface ConversationDataSourceOptions {
  signal?: AbortSignal | undefined;
}

export interface ConversationDataSource {
  delete(id: string, options?: ConversationDataSourceOptions): Promise<void>;
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
    delete: async () => Promise.reject(new Error(unavailableMessage)),
  };
}

export function createEmptyConversationDataSource(): ConversationDataSource {
  return {
    list: async () => [],
    delete: async (id) => {
      throw new Error(`Conversation "${id}" does not exist in the empty data source.`);
    },
    get: async (id) => {
      throw new Error(
        `Conversation "${id}" does not exist in the empty data source.`,
      );
    },
  };
}

declare module "../../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap {
    [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE]: ConversationDataSource;
  }
}
