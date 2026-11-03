import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { parseUIPluginManifest } from "@za38.03/agent-ui-plugins/contracts";
import { SearchSourcesToolUI } from "./index";
import manifestJson from "./manifest.json";

const plugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { search_sources: { type: "backend", display: "standalone", render: SearchSourcesToolUI } },
  Component: () => null,
};
export default plugin;
