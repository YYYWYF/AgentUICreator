import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { MockRunCiJobToolUI } from "./index";
import manifestJson from "./manifest.json";

const plugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { "run_ci_job": { type: "backend", display: "standalone", render: MockRunCiJobToolUI } },
  Component: () => null,
};
export default plugin;
