import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiThinkingIndicatorPlugin } from "./index";
import manifestJson from "./manifest.json";
export const assistantUiThinkingIndicatorPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), Component: AssistantUiThinkingIndicatorPlugin,
};
export default assistantUiThinkingIndicatorPlugin;
