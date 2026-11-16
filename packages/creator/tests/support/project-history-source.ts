import type { ConversationDetail, ConversationSummary } from '../../src/mock-agent/conversations/types.js';

// Node tooling tests bundle the frontend template rather than compiling its
// browser imports into Creator's NodeNext compilation.
export interface ProjectConversationDataSource {
  list(options?: { signal?: AbortSignal }): Promise<ConversationSummary[]>;
  get(id: string, options?: { signal?: AbortSignal }): Promise<ConversationDetail>;
  delete(id: string, options?: { signal?: AbortSignal }): Promise<void>;
  rename?(id: string, title: string): Promise<void>;
  archive?(id: string): Promise<void>;
  unarchive?(id: string): Promise<void>;
}
