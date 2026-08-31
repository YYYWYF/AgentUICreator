import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AntdXActivityFeedPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXActivityFeedPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AntdXActivityFeedPlugin,
};
