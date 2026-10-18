import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AgentStatusMessagePlugin } from "./index";
import manifestJson from "./manifest.json";
export const agentStatusMessagePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { "mock_agent_status": { type: "backend", display: "standalone", render: AgentStatusMessagePlugin } },
  Component: () => null,
};
export default agentStatusMessagePlugin;
