import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiComposerPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiComposerPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiComposerPlugin,
};

export default assistantUiComposerPlugin;
