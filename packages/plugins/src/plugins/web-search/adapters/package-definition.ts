import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { WebSearchPlugin } from "./index";
import manifestJson from "./manifest.json";
export const webSearchPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { "web_search": { type: "backend", display: "standalone", render: WebSearchPlugin } },
  Component: () => null,
};
export default webSearchPlugin;
