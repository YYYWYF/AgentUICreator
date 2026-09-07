import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import {
  parseUIPluginManifest,
} from "../../framework/contracts/ui-plugin";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import { AntdXMessageListPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXMessageListPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_CONVERSATION_SERVICE],
  Component: AntdXMessageListPlugin,
};

export default antdXMessageListPlugin;
