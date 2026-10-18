import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { LocaleProviderPlugin } from "./index";
import manifestJson from "./manifest.json";
export function bindSetup<TContext>(setup: (context:TContext)=>void|(()=>void)): (context:TContext)=>void|(()=>void) { return context => setup(context); }
export { createAgentUILocaleService } from "./adapters/locale-service";
export const localeProviderPlugin = { manifest: parseUIPluginManifest(manifestJson), provides: ["agent-ui.locale"], inject: [], optionalInject: [], bindSetup, setup: () => { throw new Error("PLUGIN_HOST_BINDINGS_REQUIRED"); }, Component: LocaleProviderPlugin } satisfies UIPluginDefinition & { bindSetup: typeof bindSetup };
export default localeProviderPlugin;
