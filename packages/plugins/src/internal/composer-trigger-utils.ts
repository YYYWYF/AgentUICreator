import { trySerializeAgentUIDirective } from "@za38.03/agent-ui-core";
import type { ConversationMentionItem } from "./composer-trigger-types.js";
export function serializeConversationDirective(item: ConversationMentionItem): string | undefined {
  return trySerializeAgentUIDirective(item);
}
