import type { UIPluginDefinition, UIPluginManifest } from "@za38.03/agent-ui-plugins";
import { defineDataMessageUI } from "@za38.03/agent-ui-plugins";
import manifestJson from "./manifest.json";
import { InspectionResultMessagePlugin } from "./index";
import { INSPECTION_RESULT_EVENT } from "./schema";

const definition: UIPluginDefinition = {
  manifest: manifestJson as UIPluginManifest,
  provides: [],
  inject: [],
  optionalInject: ["agent-ui.locale"],
  dataMessageUIs: [
    defineDataMessageUI<unknown>({
      name: INSPECTION_RESULT_EVENT,
      render: InspectionResultMessagePlugin,
    }),
  ],
  Component: () => null,
};

export default definition;
