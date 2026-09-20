import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { AssistantUiExportMarkdownActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiExportMarkdownActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  Component: AssistantUiExportMarkdownActionPlugin,
};

export default assistantUiExportMarkdownActionPlugin;
