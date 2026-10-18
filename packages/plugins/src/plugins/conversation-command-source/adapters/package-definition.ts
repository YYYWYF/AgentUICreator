import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationCommandSourcePlugin } from "./index";
import manifestJson from "./manifest.json";
export function bindSetup<TContext>(setup: (context:TContext)=>void|(()=>void)): (context:TContext)=>void|(()=>void) { return context => setup(context); }
export const conversationCommandSourcePlugin = { manifest: parseUIPluginManifest(manifestJson), provides: ["conversation.slash-command-source"], inject: [], optionalInject: ["agent-ui.locale"], bindSetup, setup: () => { throw new Error("PLUGIN_HOST_BINDINGS_REQUIRED"); }, Component: ConversationCommandSourcePlugin } satisfies UIPluginDefinition & { bindSetup: typeof bindSetup };
export default conversationCommandSourcePlugin;
