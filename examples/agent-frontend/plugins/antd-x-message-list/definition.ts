import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import {
  parseUIPluginManifest,
} from "../../framework/contracts/ui-plugin";
import { AntdXMessageListPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXMessageListPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AntdXMessageListPlugin,
};

export default antdXMessageListPlugin;
