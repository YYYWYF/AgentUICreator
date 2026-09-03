import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import {
  parseUIPluginManifest,
  parseUIPluginSlotDefinitions,
} from "../../framework/contracts/ui-plugin";
import { AntdXMessageListPlugin } from "./index";
import manifestJson from "./manifest.json";
import slotsJson from "./slots.json";

export const antdXMessageListPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  slots: parseUIPluginSlotDefinitions(slotsJson),
  Component: AntdXMessageListPlugin,
};

export default antdXMessageListPlugin;
