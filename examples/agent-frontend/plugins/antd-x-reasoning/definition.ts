import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AntdXReasoningPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXReasoningPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AntdXReasoningPlugin,
};

export default antdXReasoningPlugin;
