import type { UIPluginDefinition, UIPluginManifest } from "@za38.03/agent-ui-plugins";
import manifestJson from "./manifest.json";
import { QuickHelpContentPlugin } from "./index";

const definition: UIPluginDefinition = {
  manifest: manifestJson as UIPluginManifest,
  provides: [],
  inject: [],
  optionalInject: ["agent-ui.locale"],
  Component: QuickHelpContentPlugin,
};

export default definition;
