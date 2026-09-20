import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiSubmitActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiSubmitActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiSubmitActionPlugin,
};

export default assistantUiSubmitActionPlugin;
