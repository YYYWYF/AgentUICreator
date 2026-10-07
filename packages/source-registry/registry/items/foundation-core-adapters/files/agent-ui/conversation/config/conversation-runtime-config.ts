import { resolveLocaleNamespace } from "../../i18n/locale-registry";
import { agentUILocaleConfig } from "../../i18n/locale-config";
import type { AgentUILocaleCode } from "../../i18n/locale-types";
import type { ConversationStarterSuggestion } from "@agent-ui/runtime-conversation";

/** Opt in only after reviewing the pinned upstream client-tool handoff race.
 * Browser-memory follow-up Queue; not durable across refresh. */
export const conversationMessageQueueEnabled = false;

/** Host-owned endpoint. Set this when integrating Agent UI with your application. */
export const conversationDataEndpoint: string | undefined = undefined;

export function getConversationStarterSuggestions(locale: AgentUILocaleCode): readonly ConversationStarterSuggestion[] {
  const messages = resolveLocaleNamespace(locale, "starterSuggestions");
  return [
    { title: messages.architectureTitle, label: messages.architectureLabel, prompt: messages.architecturePrompt },
    { title: messages.debugTitle, label: messages.debugLabel, prompt: messages.debugPrompt },
    { title: messages.nextTitle, label: messages.nextLabel, prompt: messages.nextPrompt },
  ];
}

/** Compatibility export for hosts with a fixed default locale. */
export const conversationStarterSuggestions = getConversationStarterSuggestions(agentUILocaleConfig.defaultLocale);
