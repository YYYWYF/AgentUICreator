import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { parseUIPluginManifest } from "@za38.03/agent-ui-plugins/contracts";
import { ConversationSuggestionsPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationSuggestionsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationSuggestionsPlugin,
};

export default conversationSuggestionsPlugin;
