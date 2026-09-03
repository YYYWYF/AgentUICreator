import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AntdXResourcesPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXResourcesPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AntdXResourcesPlugin,
};

export default antdXResourcesPlugin;
