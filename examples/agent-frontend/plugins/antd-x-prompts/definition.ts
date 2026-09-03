import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AntdXPromptsPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXPromptsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AntdXPromptsPlugin,
};

export default antdXPromptsPlugin;
