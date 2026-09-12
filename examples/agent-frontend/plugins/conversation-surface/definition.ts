import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import { AGENT_UI_THEME_SERVICE } from "../../services/agent-ui-theme";
import { ConversationSurfacePlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationSurfacePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_CONVERSATION_SERVICE, AGENT_UI_THEME_SERVICE],
  Component: ConversationSurfacePlugin,
};

export default conversationSurfacePlugin;
