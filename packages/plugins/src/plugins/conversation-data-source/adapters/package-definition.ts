import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationDataSourcePlugin } from "./index";
import manifestJson from "./manifest.json";
export function bindSetup<TContext>(setup: (context:TContext)=>void|(()=>void)): (context:TContext)=>void|(()=>void) { return context => setup(context); }
export const conversationDataSourcePlugin = { manifest: parseUIPluginManifest(manifestJson), provides: ["agent-ui.conversation-data-source"], inject: [], optionalInject: [], bindSetup, setup: () => { throw new Error("PLUGIN_HOST_BINDINGS_REQUIRED"); }, Component: ConversationDataSourcePlugin } satisfies UIPluginDefinition & { bindSetup: typeof bindSetup };
export default conversationDataSourcePlugin;
