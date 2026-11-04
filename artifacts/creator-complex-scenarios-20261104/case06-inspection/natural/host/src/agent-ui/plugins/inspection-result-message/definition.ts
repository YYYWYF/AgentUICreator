import type { UIPluginDefinition, UIPluginManifest } from "@za38.03/agent-ui-plugins";
import { defineDataMessageUI } from "@za38.03/agent-ui-plugins";
import manifestJson from "./manifest.json";
import { InspectionResultMessage } from "./index";

const definition: UIPluginDefinition = {
  manifest: manifestJson as UIPluginManifest,
  provides: [],
  inject: [],
  optionalInject: ["agent-ui.locale"],
  dataMessageUIs: [
    defineDataMessageUI<unknown>({
      // Static literal required: the registry generator reads this name at build time.
      name: "app.inspection.result",
      render: InspectionResultMessage,
    }),
  ],
  Component: () => null,
};

export default definition;
