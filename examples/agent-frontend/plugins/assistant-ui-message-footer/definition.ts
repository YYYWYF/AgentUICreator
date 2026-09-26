import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiMessageFooterPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiMessageFooterPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiMessageFooterPlugin,
};

export default assistantUiMessageFooterPlugin;
