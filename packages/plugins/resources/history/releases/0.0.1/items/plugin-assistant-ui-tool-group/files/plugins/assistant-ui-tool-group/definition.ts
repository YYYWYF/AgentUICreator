import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiToolGroupPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiToolGroupPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiToolGroupPlugin,
};

export default assistantUiToolGroupPlugin;
