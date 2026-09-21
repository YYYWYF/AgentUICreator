import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { JobProgressPlugin } from "./index";
import manifestJson from "./manifest.json";

export const jobProgressPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: JobProgressPlugin,
};

export default jobProgressPlugin;
