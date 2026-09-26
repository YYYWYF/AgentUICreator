import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { MockAgentPlanToolUI } from "./index";
import manifestJson from "./manifest.json";

const plugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { "mock_agent_plan": { type: "backend", display: "standalone", render: MockAgentPlanToolUI } },
  Component: () => null,
};
export default plugin;
