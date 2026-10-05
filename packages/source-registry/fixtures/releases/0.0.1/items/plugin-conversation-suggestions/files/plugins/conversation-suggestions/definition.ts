import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { ConversationSuggestionsPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationSuggestionsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationSuggestionsPlugin,
};

export default conversationSuggestionsPlugin;
