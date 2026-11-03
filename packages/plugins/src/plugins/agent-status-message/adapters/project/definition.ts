import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { parseUIPluginManifest } from "@za38.03/agent-ui-plugins/contracts";
import { MockAgentStatusToolUI } from "./index";
import manifestJson from "./manifest.json";

const plugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { "mock_agent_status": { type: "backend", display: "standalone", render: MockAgentStatusToolUI } },
  Component: () => null,
};
export default plugin;
