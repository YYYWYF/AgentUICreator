import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiCopyActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiCopyActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiCopyActionPlugin,
};

export default assistantUiCopyActionPlugin;
