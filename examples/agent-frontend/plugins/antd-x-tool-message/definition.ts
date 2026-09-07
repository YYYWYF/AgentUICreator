import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AntdXToolMessagePlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXToolMessagePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AntdXToolMessagePlugin,
};

export default antdXToolMessagePlugin;
