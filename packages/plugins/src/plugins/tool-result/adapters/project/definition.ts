import { parseUIPluginManifest, type UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { ConversationToolResultPlugin } from "./index";
import manifestJson from "./manifest.json";
export const toolResultPlugin: UIPluginDefinition = { manifest: parseUIPluginManifest(manifestJson), Component: ConversationToolResultPlugin };
export default toolResultPlugin;
