import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AuthAccountPlugin } from "./index";
import manifestJson from "./manifest.json";
export const authAccountPlugin = { manifest: parseUIPluginManifest(manifestJson), provides: [], inject: [], optionalInject: ["auth.session", "agent-ui.locale"], Component: AuthAccountPlugin } satisfies UIPluginDefinition;
export default authAccountPlugin;
