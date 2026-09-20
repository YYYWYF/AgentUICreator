import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { AssistantUiDictationActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiDictationActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  Component: AssistantUiDictationActionPlugin,
};

export default assistantUiDictationActionPlugin;
