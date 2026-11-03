import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { parseUIPluginManifest } from "@za38.03/agent-ui-plugins/contracts";
import { chartMessageUI } from "./index";
import manifestJson from "./manifest.json";

export const chartMessagePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  dataMessageUIs: [chartMessageUI],
  Component: () => null,
};

export default chartMessagePlugin;
