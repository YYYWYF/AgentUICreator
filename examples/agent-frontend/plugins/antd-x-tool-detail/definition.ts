import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AntdXToolDetailPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXToolDetailPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AntdXToolDetailPlugin,
};

export default antdXToolDetailPlugin;
