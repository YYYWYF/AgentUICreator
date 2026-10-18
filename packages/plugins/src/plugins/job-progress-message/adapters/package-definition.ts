import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { JobProgressMessagePlugin } from "./index";
import manifestJson from "./manifest.json";
export const jobProgressMessagePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { "run_ci_job": { type: "backend", display: "standalone", render: JobProgressMessagePlugin } },
  Component: () => null,
};
export default jobProgressMessagePlugin;
