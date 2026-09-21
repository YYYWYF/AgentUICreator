import {
  parseUIPluginManifest,
  type UIPluginDefinition,
} from "../../framework/contracts/ui-plugin";
import { SubagentConversationPlugin } from "./index";
import manifestJson from "./manifest.json";

export const subagentConversationPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: SubagentConversationPlugin,
};

export default subagentConversationPlugin;
