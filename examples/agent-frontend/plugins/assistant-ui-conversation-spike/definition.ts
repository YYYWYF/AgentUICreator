import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AssistantUiConversationSpikePlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiConversationSpikePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiConversationSpikePlugin,
};

export default assistantUiConversationSpikePlugin;
