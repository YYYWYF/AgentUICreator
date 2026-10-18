import { useEffect } from "react";
import { usePluginService } from "../../runtime/plugins";
import { CONVERSATION_MENTION_SOURCE, CONVERSATION_COMMAND_SOURCE, type ConversationCommandRegistry } from "../../services/composer-triggers";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";
import type { DemoMentionSource } from "./source";
export function ComposerTriggerDemoPlugin() {
  const mentions = usePluginService<DemoMentionSource>(CONVERSATION_MENTION_SOURCE);
  const commands = usePluginService<ConversationCommandRegistry>(CONVERSATION_COMMAND_SOURCE);
  const labels = useAgentUILocale("composerTriggerDemo");
  useEffect(() => {
    mentions?.setItems([
      { id: "employee_84721", type: "user", label: labels.personOne, description: labels.departmentOne },
      { id: "employee_84722", type: "user", label: labels.personTwo, description: labels.departmentTwo },
      { id: "employee_84723", type: "user", label: labels.personThree, description: labels.departmentThree },
    ], labels.localeKey);
  }, [mentions, labels]);
  useEffect(() => commands?.register({ id: "summarize", label: labels.summarize, mode: "directive" }), [commands, labels.summarize]);
  return null;
}
