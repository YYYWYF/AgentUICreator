import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_THEME_SERVICE } from "../../services/agent-ui-theme";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import { AssistantUiThreadListPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiThreadListPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_CONVERSATION_SERVICE],
  optionalInject: [AGENT_UI_THEME_SERVICE],
  Component: AssistantUiThreadListPlugin,
};

export default assistantUiThreadListPlugin;
