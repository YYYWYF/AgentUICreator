import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AntdXToolActivityPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXToolActivityPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AntdXToolActivityPlugin,
};

export default antdXToolActivityPlugin;
