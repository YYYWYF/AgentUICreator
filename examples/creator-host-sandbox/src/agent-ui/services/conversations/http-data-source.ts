import {
  createHttpConversationDataSource as createImplementation,
  type HttpConversationDataSourceOptions,
} from '../../plugins/conversation-data-source';

export type { HttpConversationDataSourceOptions };

// Project-owned address, user authentication and API overrides. Defaults and
// backend compatibility live in the selected conversation-data-source implementation.
export const conversationDataSourceConfig: Partial<HttpConversationDataSourceOptions> = {
  headers: () => ({}),
  credentials: 'same-origin',
};

export function createHttpConversationDataSource(options: HttpConversationDataSourceOptions) {
  return createImplementation({
    ...conversationDataSourceConfig,
    ...options,
    routes: { ...conversationDataSourceConfig.routes, ...options.routes },
  });
}
