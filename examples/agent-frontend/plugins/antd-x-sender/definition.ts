import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import { AntdXSenderPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXSenderPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_CONVERSATION_SERVICE],
  Component: AntdXSenderPlugin,
};

export default antdXSenderPlugin;
