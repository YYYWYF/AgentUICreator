import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { WebSearchToolUI } from "./index";
import manifest from "./manifest.json";

export default {
  manifest: parseUIPluginManifest(manifest),
  toolkit: { web_search: { type: "backend", display: "standalone", render: WebSearchToolUI } },
  Component: () => null,
} satisfies UIPluginDefinition;
