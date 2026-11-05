import { defineDataMessageUI } from "@za38.03/agent-ui-plugins";
import type { UIPluginDefinition, UIPluginManifest } from "@za38.03/agent-ui-plugins";
import manifestJson from "./manifest.json";
import { SalesReportMessagePlugin } from "./index";

const definition: UIPluginDefinition = {
  manifest: manifestJson as UIPluginManifest,
  provides: [],
  inject: [],
  optionalInject: ["agent-ui.locale"],
  dataMessageUIs: [
    defineDataMessageUI<unknown>({
      name: "app.sales.report",
      render: SalesReportMessagePlugin,
    }),
  ],
  Component: () => null,
};

export default definition;
