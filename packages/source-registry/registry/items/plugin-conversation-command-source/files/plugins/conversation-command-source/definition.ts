import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { CONVERSATION_COMMAND_SOURCE, createConversationCommandRegistry } from "../../services/composer-triggers";
import { ConversationCommandSourcePlugin } from "./index";
import { AGENT_UI_LOCALES } from "../../agent-ui/i18n/locale-registry";
import { agentUILocaleConfig } from "../../agent-ui/i18n/locale-config";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import manifestJson from "./manifest.json";
export const conversationCommandSourcePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), provides: [CONVERSATION_COMMAND_SOURCE],
  setup: ({ services, actions }) => {
    const source = createConversationCommandRegistry();
    services.provide(CONVERSATION_COMMAND_SOURCE, source);
    const locale = services.get(AGENT_UI_LOCALE_SERVICE);
    let unregister: (() => void) | undefined;
    const register = () => {
      unregister?.();
      const code = locale?.getSnapshot().locale ?? agentUILocaleConfig.defaultLocale;
      unregister = source.register({ id: "new", label: AGENT_UI_LOCALES[code].conversationTriggers.newConversation,
        mode: "action", execute: () => Promise.resolve(actions.startNewConversation()).then(() => undefined) });
    };
    register();
    const unsubscribe = locale?.subscribe(register);
    return () => { unsubscribe?.(); unregister?.(); };
  },
  optionalInject: [AGENT_UI_LOCALE_SERVICE], Component: ConversationCommandSourcePlugin,
};
export default conversationCommandSourcePlugin;
