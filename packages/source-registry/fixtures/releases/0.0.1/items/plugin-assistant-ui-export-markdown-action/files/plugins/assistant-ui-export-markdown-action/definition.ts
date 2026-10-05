import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiExportMarkdownActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiExportMarkdownActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiExportMarkdownActionPlugin,
};

export default assistantUiExportMarkdownActionPlugin;
