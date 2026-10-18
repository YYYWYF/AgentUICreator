import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationServicePlugin } from "./index";
import manifestJson from "./manifest.json";
export function bindSetup<TContext>(setup: (context:TContext)=>void|(()=>void)): (context:TContext)=>void|(()=>void) { return context => setup(context); }
export const conversationServicePlugin = { manifest: parseUIPluginManifest(manifestJson), provides: ["agent-ui.conversations"], inject: ["agent-ui.conversation-data-source"], optionalInject: [], bindSetup, setup: () => { throw new Error("PLUGIN_HOST_BINDINGS_REQUIRED"); }, Component: ConversationServicePlugin } satisfies UIPluginDefinition & { bindSetup: typeof bindSetup };
export default conversationServicePlugin;
