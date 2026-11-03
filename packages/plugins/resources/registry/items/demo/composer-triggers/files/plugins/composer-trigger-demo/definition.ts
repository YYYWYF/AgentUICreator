import { parseUIPluginManifest, type UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { CONVERSATION_MENTION_SOURCE, CONVERSATION_COMMAND_SOURCE } from "../../services/composer-triggers";
import { createDemoMentionSource } from "./source";
import { ComposerTriggerDemoPlugin } from "./index";
import { AGENT_UI_PRESENTATION_LOCALES as AGENT_UI_LOCALES } from "@za38.03/agent-ui-plugins";
import { AGENT_UI_LOCALE_SERVICE } from "@za38.03/agent-ui-runtime/ui/services/agent-ui-locale";
import manifestJson from "./manifest.json";
export const composerTriggerDemoPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), provides: [CONVERSATION_MENTION_SOURCE], inject: [CONVERSATION_COMMAND_SOURCE],
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  setup: ({ services }) => {
    const mentions = createDemoMentionSource();
    services.provide(CONVERSATION_MENTION_SOURCE, mentions);
    const commands = services.get(CONVERSATION_COMMAND_SOURCE);
    const locale = services.get(AGENT_UI_LOCALE_SERVICE);
    let unregister: (() => void) | undefined;
    const register = () => {
      unregister?.();
      const code = locale?.getSnapshot().locale ?? "zh-CN";
      const labels = AGENT_UI_LOCALES[code].composerTriggerDemo;
      mentions.setItems([
        { id: "employee_84721", type: "user", label: labels.personOne, description: labels.departmentOne },
        { id: "employee_84722", type: "user", label: labels.personTwo, description: labels.departmentTwo },
        { id: "employee_84723", type: "user", label: labels.personThree, description: labels.departmentThree },
      ], labels.localeKey);
      unregister = commands?.register({ id: "summarize", label: labels.summarize, mode: "directive" });
    };
    register();
    const unsubscribe = locale?.subscribe(register);
    return () => { unsubscribe?.(); unregister?.(); };
  },
  Component: ComposerTriggerDemoPlugin,
};
export default composerTriggerDemoPlugin;
