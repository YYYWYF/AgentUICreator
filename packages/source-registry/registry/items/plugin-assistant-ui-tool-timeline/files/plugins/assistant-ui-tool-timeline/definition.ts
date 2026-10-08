import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiToolTimelinePlugin } from "./index";
import manifestJson from "./manifest.json";
export const assistantUiToolTimelinePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), Component: AssistantUiToolTimelinePlugin,
};
export default assistantUiToolTimelinePlugin;
