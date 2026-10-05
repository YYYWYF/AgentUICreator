import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { CONVERSATION_MENTION_SOURCE, CONVERSATION_COMMAND_SOURCE } from "../../services/composer-triggers";
import { createDemoMentionSource } from "./source";
import { ComposerTriggerDemoPlugin } from "./index";
import manifestJson from "./manifest.json";
export const composerTriggerDemoPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), provides: [CONVERSATION_MENTION_SOURCE], inject: [CONVERSATION_COMMAND_SOURCE],
  setup: ({ services }) => { services.provide(CONVERSATION_MENTION_SOURCE, createDemoMentionSource()); },
  Component: ComposerTriggerDemoPlugin,
};
export default composerTriggerDemoPlugin;
