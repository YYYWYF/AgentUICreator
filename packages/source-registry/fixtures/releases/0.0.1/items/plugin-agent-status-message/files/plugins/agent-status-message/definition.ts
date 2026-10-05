import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { MockAgentStatusToolUI } from "./index";
import manifestJson from "./manifest.json";

const plugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { "mock_agent_status": { type: "backend", display: "standalone", render: MockAgentStatusToolUI } },
  Component: () => null,
};
export default plugin;
