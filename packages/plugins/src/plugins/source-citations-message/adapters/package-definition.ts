import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { SourceCitationsMessagePlugin } from "./index";
import manifestJson from "./manifest.json";
export const sourceCitationsMessagePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { "search_sources": { type: "backend", display: "standalone", render: SourceCitationsMessagePlugin } },
  Component: () => null,
};
export default sourceCitationsMessagePlugin;
