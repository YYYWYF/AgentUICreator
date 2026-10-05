import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import { AGENT_UI_THEME_SERVICE } from "../../services/agent-ui-theme";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { ConversationSurfacePlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationSurfacePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_CONVERSATION_SERVICE],
  optionalInject: [AGENT_UI_THEME_SERVICE, AGENT_UI_LOCALE_SERVICE],
  Component: ConversationSurfacePlugin,
};

export default conversationSurfacePlugin;
