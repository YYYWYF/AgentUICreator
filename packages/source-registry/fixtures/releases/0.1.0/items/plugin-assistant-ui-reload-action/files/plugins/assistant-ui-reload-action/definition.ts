import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiReloadActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiReloadActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiReloadActionPlugin,
};

export default assistantUiReloadActionPlugin;
