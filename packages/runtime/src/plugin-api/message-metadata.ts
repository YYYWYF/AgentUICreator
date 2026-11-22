import { createContext } from 'react';
import type { ConversationMessageMetadata, ConversationMessageMetadataTarget } from '../compatibility/conversation-message-metadata.js';

export type { ConversationMessageMetadata, ConversationMessageMetadataTarget } from '../compatibility/conversation-message-metadata.js';
/** Internal data port consumed by the unified useConversation facade. */
export interface ConversationMessageMetadataPort {
  read(message: ConversationMessageMetadataTarget): ConversationMessageMetadata;
  subscribe(listener: () => void): () => void;
  getRevision(): number;
}

export const ConversationMessageMetadataContext = createContext<ConversationMessageMetadataPort | undefined>(undefined);
