import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { RetrievalChunksToolUI } from "./index";
import manifest from "./manifest.json";

export default {
  manifest: parseUIPluginManifest(manifest),
  toolkit: { search_docs: { type: "backend", display: "standalone", render: RetrievalChunksToolUI } },
  Component: () => null,
} satisfies UIPluginDefinition;
