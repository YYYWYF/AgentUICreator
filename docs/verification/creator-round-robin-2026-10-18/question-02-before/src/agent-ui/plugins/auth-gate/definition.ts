import implementation from "@za38.03/agent-ui-plugins/auth-gate";
import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { createHostAuthAdapter } from "./host-auth-adapter";
import {AUTH_GATE_SERVICE,AUTH_SESSION_SERVICE} from "../../services/auth/session";
import { createAuthSession } from "@za38.03/agent-ui-plugins/auth-gate";
import { AuthGatePlugin } from "./index";
import manifestJson from "./manifest.json";
export const authGatePlugin: UIPluginDefinition = {
  manifest: implementation.manifest, provides: [AUTH_GATE_SERVICE, AUTH_SESSION_SERVICE], optionalInject: [AGENT_UI_LOCALE_SERVICE],
  setup: implementation.bindSetup(({ services }: Parameters<NonNullable<UIPluginDefinition["setup"]>>[0]) => {
    const session = createAuthSession(createHostAuthAdapter());
    services.provide(AUTH_GATE_SERVICE, session.gate); services.provide(AUTH_SESSION_SERVICE, session);
    void session.restore(); return () => session.dispose();
  }),
  Component: AuthGatePlugin,
};
export default authGatePlugin;
