import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AgentReasoningPlugin } from "./index";
import manifestJson from "./manifest.json";

export const agentReasoningPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AgentReasoningPlugin,
};

export default agentReasoningPlugin;
