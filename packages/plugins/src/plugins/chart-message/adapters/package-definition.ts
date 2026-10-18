import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ChartMessagePlugin } from "./index";
import manifestJson from "./manifest.json";
import { defineDataMessageUI } from "@za38.03/agent-ui-plugins";
export const chartMessagePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  dataMessageUIs: [defineDataMessageUI<unknown>({ name: "chart", render: ChartMessagePlugin })],
  Component: () => null,
};
export default chartMessagePlugin;
