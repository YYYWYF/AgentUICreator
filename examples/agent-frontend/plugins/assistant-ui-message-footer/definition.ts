import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { AssistantUiMessageFooterPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiMessageFooterPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  Component: AssistantUiMessageFooterPlugin,
};

export default assistantUiMessageFooterPlugin;
