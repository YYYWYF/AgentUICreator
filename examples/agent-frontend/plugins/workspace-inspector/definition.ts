import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { WorkspaceInspectorPlugin } from "./index";
import manifestJson from "./manifest.json";

export const workspaceInspectorPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: WorkspaceInspectorPlugin,
};

export default workspaceInspectorPlugin;
