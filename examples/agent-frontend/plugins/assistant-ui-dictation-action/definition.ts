import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiDictationActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiDictationActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiDictationActionPlugin,
};

export default assistantUiDictationActionPlugin;
