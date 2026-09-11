import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AgentThreadWelcomePlugin } from "./index";
import manifestJson from "./manifest.json";

export const agentThreadWelcomePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AgentThreadWelcomePlugin,
};

export default agentThreadWelcomePlugin;
