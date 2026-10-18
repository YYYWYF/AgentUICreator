import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { GenerateFileToolUI } from "./index";
import manifestJson from "./manifest.json";

const plugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { generate_file: { type: "backend", display: "standalone", render: GenerateFileToolUI } },
  Component: () => null,
};
export default plugin;
