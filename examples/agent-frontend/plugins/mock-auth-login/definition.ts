import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AUTH_SESSION_SERVICE } from "../../services/auth-session";
import { MockAuthLoginPlugin } from "./index";
import manifestJson from "./manifest.json";
import { createMockAuthController } from "./mock-auth-controller";

export const mockAuthLoginPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  provides: ["auth.gate", AUTH_SESSION_SERVICE],
  setup: ({ services }) => {
    const controller = createMockAuthController();
    const disposeGate = services.provide("auth.gate", controller.gate);
    const disposeSession = services.provide(
      AUTH_SESSION_SERVICE,
      controller.session,
    );

    controller.initialize();

    return () => {
      controller.dispose();
      disposeSession();
      disposeGate();
    };
  },
  Component: MockAuthLoginPlugin,
};

export default mockAuthLoginPlugin;
