import { parseUIPluginManifest, type UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { AGENT_UI_LOCALE_SERVICE } from "@za38.03/agent-ui-runtime/ui/services/agent-ui-locale";
import { AccountView } from "./index";
import manifestJson from "./manifest.json";
export const authAccountPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), optionalInject: ["auth.session", AGENT_UI_LOCALE_SERVICE], Component: AccountView,
};
export default authAccountPlugin;
