import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { FilePreviewPlugin } from "./index";
import manifestJson from "./manifest.json";

export const filePreviewPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: FilePreviewPlugin,
};
