import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { chartMessageUI } from "./index";
import manifestJson from "./manifest.json";

export const chartMessagePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  dataMessageUIs: [chartMessageUI],
  Component: () => null,
};

export default chartMessagePlugin;
