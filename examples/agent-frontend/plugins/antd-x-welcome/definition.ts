import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AntdXWelcomePlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXWelcomePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AntdXWelcomePlugin,
};
