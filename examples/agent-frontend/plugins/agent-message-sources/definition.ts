import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AgentMessageSourcesPlugin } from "./index";
import manifestJson from "./manifest.json";

export const agentMessageSourcesPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AgentMessageSourcesPlugin,
};

export default agentMessageSourcesPlugin;
