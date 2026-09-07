import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { ConversationSurfacePlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationSurfacePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationSurfacePlugin,
};

export default conversationSurfacePlugin;
