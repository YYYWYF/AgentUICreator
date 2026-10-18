import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { TaskGroupPlugin } from "./index";
import manifestJson from "./manifest.json";

export const taskGroupPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: TaskGroupPlugin,
};

export default taskGroupPlugin;
