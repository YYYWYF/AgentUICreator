import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AgentToolPlugin } from "./index";
import manifestJson from "./manifest.json";

export const agentToolPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AgentToolPlugin,
};

export default agentToolPlugin;
