import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { AssistantUiSubmitActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiSubmitActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  Component: AssistantUiSubmitActionPlugin,
};

export default assistantUiSubmitActionPlugin;
