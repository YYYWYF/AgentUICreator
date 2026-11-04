import type { UIPluginDefinition, UIPluginManifest } from "@za38.03/agent-ui-plugins";
import manifestJson from "./manifest.json";
import { salesReportMessageUI } from "./index";

const definition: UIPluginDefinition = {
  manifest: manifestJson as UIPluginManifest,
  dataMessageUIs: [salesReportMessageUI],
  Component: () => null,
};

export default definition;
