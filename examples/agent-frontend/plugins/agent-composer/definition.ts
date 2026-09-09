import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import { AgentComposerPlugin } from "./index";
import manifestJson from "./manifest.json";

export const agentComposerPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_CONVERSATION_SERVICE],
  Component: AgentComposerPlugin,
};

export default agentComposerPlugin;
