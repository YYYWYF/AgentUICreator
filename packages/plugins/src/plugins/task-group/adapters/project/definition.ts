import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { parseUIPluginManifest } from "@za38.03/agent-ui-plugins/contracts";
import { TaskGroupPlugin } from "./index";
import manifestJson from "./manifest.json";

export const taskGroupPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: TaskGroupPlugin,
};

export default taskGroupPlugin;
