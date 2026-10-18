import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AgentPlanMessagePlugin } from "./index";
import manifestJson from "./manifest.json";
import { defineDataMessageUI } from "@za38.03/agent-ui-plugins";
export const agentPlanMessagePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  dataMessageUIs: [defineDataMessageUI<unknown>({ name: "agui-activity/agent-plan", render: AgentPlanMessagePlugin })],
  Component: () => null,
};
export default agentPlanMessagePlugin;
