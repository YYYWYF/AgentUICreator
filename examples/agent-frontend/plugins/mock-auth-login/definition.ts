import {
  parseUIPluginManifest,
  type UIPluginDefinition,
} from "../../framework/contracts/ui-plugin";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { AGENT_UI_THEME_SERVICE } from "../../services/agent-ui-theme";
import { AUTH_GATE_SERVICE, AUTH_SESSION_SERVICE } from "../../services/auth-session";
import { MockAuthLoginPlugin } from "./index";
import { createMockAuthController } from "./mock-auth-controller";
import manifestJson from "./manifest.json";

export const mockAuthLoginPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  provides: [AUTH_GATE_SERVICE, AUTH_SESSION_SERVICE],
  inject: [AGENT_UI_LOCALE_SERVICE, AGENT_UI_THEME_SERVICE],
  setup: ({ services }) => {
    const controller = createMockAuthController();
    services.provide(AUTH_GATE_SERVICE, controller.gate);
    services.provide(AUTH_SESSION_SERVICE, controller.session);
    return () => controller.dispose();
  },
  Component: MockAuthLoginPlugin,
};

export default mockAuthLoginPlugin;
