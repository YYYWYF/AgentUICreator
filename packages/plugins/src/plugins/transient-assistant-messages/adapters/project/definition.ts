import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { TransientAssistantMessagesPlugin } from "./index";
import manifestJson from "./manifest.json";
export const transientAssistantMessagesPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), Component: TransientAssistantMessagesPlugin,
};
export default transientAssistantMessagesPlugin;
