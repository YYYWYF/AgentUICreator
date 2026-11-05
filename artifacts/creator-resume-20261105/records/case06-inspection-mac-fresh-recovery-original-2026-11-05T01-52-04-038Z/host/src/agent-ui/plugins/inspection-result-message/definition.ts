import type { UIPluginDefinition, UIPluginManifest } from "@za38.03/agent-ui-plugins";
import { defineDataMessageUI } from "@za38.03/agent-ui-plugins";
import manifestJson from "./manifest.json";
import { InspectionResultMessagePlugin } from "./index";

const definition: UIPluginDefinition = {
  manifest: manifestJson as UIPluginManifest,
  provides: [],
  inject: [],
  optionalInject: ["agent-ui.locale"],
  dataMessageUIs: [
    defineDataMessageUI<unknown>({
      // AG-UI CUSTOM event name emitted by the backend inspection report.
      name: "app.inspection.result",
      render: InspectionResultMessagePlugin,
    }),
  ],
  Component: () => null,
};

export default definition;
