import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { SearchSourcesToolUI } from "./index";
import manifestJson from "./manifest.json";

const plugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { search_sources: { type: "backend", display: "standalone", render: SearchSourcesToolUI } },
  Component: () => null,
};
export default plugin;
