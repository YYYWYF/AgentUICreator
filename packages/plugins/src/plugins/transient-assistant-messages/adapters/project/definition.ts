import { parseUIPluginManifest, type UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { TransientAssistantMessagesPlugin } from "./index";
import manifestJson from "./manifest.json";
export const transientAssistantMessagesPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), Component: TransientAssistantMessagesPlugin,
};
export default transientAssistantMessagesPlugin;
