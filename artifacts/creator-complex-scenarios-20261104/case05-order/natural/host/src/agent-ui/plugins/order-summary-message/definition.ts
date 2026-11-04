import type { UIPluginDefinition, UIPluginManifest } from "@za38.03/agent-ui-plugins";
import { defineDataMessageUI } from "@za38.03/agent-ui-plugins";
import manifestJson from "./manifest.json";
import { OrderSummaryMessagePlugin } from "./index";
import type { OrderSummaryData } from "./index";

const definition: UIPluginDefinition = {
  manifest: manifestJson as UIPluginManifest,
  provides: [],
  inject: [],
  optionalInject: ["agent-ui.locale"],
  dataMessageUIs: [
    defineDataMessageUI<OrderSummaryData>({
      name: "app.order.summary",
      render: OrderSummaryMessagePlugin,
    }),
  ],
  Component: () => null,
};

export default definition;
