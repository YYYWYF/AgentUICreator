import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ThemeSwitchPlugin } from "./index";
import manifestJson from "./manifest.json";
export const themeSwitchPlugin = { manifest: parseUIPluginManifest(manifestJson), provides: [], inject: ["agent-ui.theme"], optionalInject: ["agent-ui.locale"], Component: ThemeSwitchPlugin } satisfies UIPluginDefinition;
export default themeSwitchPlugin;
