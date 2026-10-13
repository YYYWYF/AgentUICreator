import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { createHostAuthAdapter } from "../../services/auth/adapter";
import { AUTH_GATE_SERVICE, AUTH_SESSION_SERVICE } from "../../services/auth/session";
import { createAuthSession } from "./session";
import { LoginScreen } from "./index";
import manifestJson from "./manifest.json";
export const authGatePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), provides: [AUTH_GATE_SERVICE, AUTH_SESSION_SERVICE], optionalInject: [AGENT_UI_LOCALE_SERVICE],
  setup({ services }) {
    const session = createAuthSession(createHostAuthAdapter());
    services.provide(AUTH_GATE_SERVICE, session.gate); services.provide(AUTH_SESSION_SERVICE, session);
    void session.restore(); return () => session.dispose();
  },
  Component: LoginScreen,
};
export default authGatePlugin;
