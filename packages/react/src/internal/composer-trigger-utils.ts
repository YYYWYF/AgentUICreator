import { unstable_defaultDirectiveFormatter } from "@assistant-ui/react";
import type { ConversationMentionItem } from "./composer-trigger-types.js";
export function serializeConversationDirective(item: ConversationMentionItem): string | undefined {
  if (!/^[\w-]{1,64}$/u.test(item.type) || !item.id || item.id.length > 1024 || /[}\r\n]/u.test(item.id) || !item.label || item.label.length > 1024 || /[\]\r\n]/u.test(item.label)) return undefined;
  const value = unstable_defaultDirectiveFormatter.serialize(item);
  const parsed = unstable_defaultDirectiveFormatter.parse(value);
  const segment = parsed[0];
  return parsed.length === 1 && segment?.kind === "mention" && segment.id === item.id && segment.label === item.label && segment.type === item.type ? value : undefined;
}
