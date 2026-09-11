import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AgentToolActivityPlugin } from "./index";
import manifestJson from "./manifest.json";

export const agentToolActivityPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AgentToolActivityPlugin,
};

export default agentToolActivityPlugin;
