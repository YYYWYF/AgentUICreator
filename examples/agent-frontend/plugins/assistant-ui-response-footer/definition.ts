import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiResponseFooterPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiResponseFooterPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiResponseFooterPlugin,
};

export default assistantUiResponseFooterPlugin;
