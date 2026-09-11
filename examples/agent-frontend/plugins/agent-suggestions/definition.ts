import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AgentSuggestionsPlugin } from "./index";
import manifestJson from "./manifest.json";

export const agentSuggestionsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AgentSuggestionsPlugin,
};

export default agentSuggestionsPlugin;
