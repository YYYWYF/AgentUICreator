import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { GeneratedFileMessagePlugin } from "./index";
import manifestJson from "./manifest.json";
export const generatedFileMessagePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { "generate_file": { type: "backend", display: "standalone", render: GeneratedFileMessagePlugin } },
  Component: () => null,
};
export default generatedFileMessagePlugin;
