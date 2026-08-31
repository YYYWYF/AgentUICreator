import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AntdXRunTimelinePlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXRunTimelinePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AntdXRunTimelinePlugin,
};
