import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { LocaleSwitchPlugin } from "./index";
import manifestJson from "./manifest.json";
export const localeSwitchPlugin = { manifest: parseUIPluginManifest(manifestJson), provides: [], inject: ["agent-ui.locale"], optionalInject: [], Component: LocaleSwitchPlugin } satisfies UIPluginDefinition;
export default localeSwitchPlugin;
