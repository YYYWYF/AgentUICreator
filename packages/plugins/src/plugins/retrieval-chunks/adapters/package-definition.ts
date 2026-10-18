import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { RetrievalChunksPlugin } from "./index";
import manifestJson from "./manifest.json";
export const retrievalChunksPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { "search_docs": { type: "backend", display: "standalone", render: RetrievalChunksPlugin } },
  Component: () => null,
};
export default retrievalChunksPlugin;
