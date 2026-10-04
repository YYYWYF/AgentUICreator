import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { agentPlanActivityMessageUI } from "./index";
import manifestJson from "./manifest.json";

const plugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  dataMessageUIs: [agentPlanActivityMessageUI],
  Component: () => null,
};
export default plugin;
