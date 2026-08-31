import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AntdXAttachmentsPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXAttachmentsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AntdXAttachmentsPlugin,
};
