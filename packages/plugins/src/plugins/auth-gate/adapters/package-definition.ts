import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AuthGatePlugin } from "./index";
import manifestJson from "./manifest.json";
export function bindSetup<TContext>(setup: (context:TContext)=>void|(()=>void)): (context:TContext)=>void|(()=>void) { return context => setup(context); }
export { createAuthSession } from "./adapters/session";
export type {AuthAdapter,AuthSessionService,AuthSessionSnapshot,AuthUser} from "./adapters/auth-contract";
export const authGatePlugin = { manifest: parseUIPluginManifest(manifestJson), provides: ["auth.gate", "auth.session"], inject: [], optionalInject: ["agent-ui.locale"], bindSetup, setup: () => { throw new Error("PLUGIN_HOST_BINDINGS_REQUIRED"); }, Component: AuthGatePlugin } satisfies UIPluginDefinition & { bindSetup: typeof bindSetup };
export default authGatePlugin;
