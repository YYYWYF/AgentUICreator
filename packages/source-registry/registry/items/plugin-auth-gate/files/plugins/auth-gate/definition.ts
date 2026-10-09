import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { createHostAuthAdapter } from "../../services/auth/adapter";
import { createAuthSession } from "./session";
import { LoginScreen } from "./index";
import manifestJson from "./manifest.json";
export const authGatePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), provides: ["auth.gate", "auth.session"], optionalInject: [AGENT_UI_LOCALE_SERVICE],
  setup({ services }) {
    const session = createAuthSession(createHostAuthAdapter());
    services.provide("auth.gate", session.gate); services.provide("auth.session", session);
    void session.restore(); return () => session.dispose();
  },
  Component: LoginScreen,
};
export default authGatePlugin;
