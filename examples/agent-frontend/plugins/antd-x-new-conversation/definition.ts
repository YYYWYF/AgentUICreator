import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AntdXNewConversationPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXNewConversationPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AntdXNewConversationPlugin,
};
