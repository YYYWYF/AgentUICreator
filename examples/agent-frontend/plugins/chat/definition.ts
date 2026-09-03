import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { ChatPlugin } from "./index";
import manifestJson from "./manifest.json";

export const chatPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ChatPlugin,
};

export default chatPlugin;
