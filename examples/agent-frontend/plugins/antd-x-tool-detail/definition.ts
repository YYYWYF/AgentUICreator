import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import { AntdXToolDetailPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXToolDetailPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_CONVERSATION_SERVICE],
  Component: AntdXToolDetailPlugin,
};

export default antdXToolDetailPlugin;
