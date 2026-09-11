import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import { AgentConversationsPlugin } from "./index";
import manifestJson from "./manifest.json";

export const agentConversationsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_CONVERSATION_SERVICE],
  Component: AgentConversationsPlugin,
};

export default agentConversationsPlugin;
