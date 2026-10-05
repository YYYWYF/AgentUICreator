import { trySerializeAgentUIDirective } from "@agent-ui/runtime-core";
import type { ConversationMentionItem } from "./composer-trigger-types.js";
export function serializeConversationDirective(item: ConversationMentionItem): string | undefined {
  return trySerializeAgentUIDirective(item);
}
