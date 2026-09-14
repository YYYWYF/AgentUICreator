import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AssistantUiSuggestionsPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiSuggestionsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiSuggestionsPlugin,
};

export default assistantUiSuggestionsPlugin;
