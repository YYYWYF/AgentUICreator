import { parseUIPluginManifest, type UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { RetrievalChunksToolUI } from "./index";
import manifest from "./manifest.json";

export default {
  manifest: parseUIPluginManifest(manifest),
  toolkit: { search_docs: { type: "backend", display: "standalone", render: RetrievalChunksToolUI } },
  Component: () => null,
} satisfies UIPluginDefinition;
