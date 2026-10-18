import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ThemeProviderPlugin } from "./index";
import manifestJson from "./manifest.json";
export function bindSetup<TContext>(setup: (context:TContext)=>void|(()=>void)): (context:TContext)=>void|(()=>void) { return context => setup(context); }
export { createAgentUIThemeService } from "./adapters/theme-service";
export const themeProviderPlugin = { manifest: parseUIPluginManifest(manifestJson), provides: ["agent-ui.theme"], inject: [], optionalInject: [], bindSetup, setup: () => { throw new Error("PLUGIN_HOST_BINDINGS_REQUIRED"); }, Component: ThemeProviderPlugin } satisfies UIPluginDefinition & { bindSetup: typeof bindSetup };
export default themeProviderPlugin;
