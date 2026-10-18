import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { AccountView } from "./index";
import manifestJson from "./manifest.json";
export const authAccountPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), optionalInject: ["auth.session", AGENT_UI_LOCALE_SERVICE], Component: AccountView,
};
export default authAccountPlugin;
