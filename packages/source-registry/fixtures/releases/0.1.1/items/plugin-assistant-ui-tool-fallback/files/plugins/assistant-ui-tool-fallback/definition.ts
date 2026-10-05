import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiToolFallbackPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiToolFallbackPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiToolFallbackPlugin,
};

export default assistantUiToolFallbackPlugin;
