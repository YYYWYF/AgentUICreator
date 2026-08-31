import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AntdXSourcesPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXSourcesPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AntdXSourcesPlugin,
};
