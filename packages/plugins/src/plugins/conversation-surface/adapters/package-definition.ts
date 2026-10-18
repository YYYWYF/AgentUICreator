import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationSurfacePlugin } from "./index";
import manifestJson from "./manifest.json";
export const conversationSurfacePlugin = { manifest: parseUIPluginManifest(manifestJson), provides: [], inject: ["agent-ui.conversations"], optionalInject: ["agent-ui.theme", "agent-ui.locale"], Component: ConversationSurfacePlugin } satisfies UIPluginDefinition;
export default conversationSurfacePlugin;
