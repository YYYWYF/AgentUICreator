import { expect, it, vi } from "vitest";
import { parseAppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";
import { localeProviderPlugin } from "../plugins/locale-provider/definition";
import { mockAuthLoginPlugin } from "../plugins/mock-auth-login/definition";
import { themeProviderPlugin } from "../plugins/theme-provider/definition";
import { createPluginRegistry, PluginServiceRuntime } from "../runtime/plugins";
import { AUTH_SESSION_SERVICE, type AuthSessionService } from "../services/auth-session";

it("blocks Workspace activation until demo login and blocks it again on logout", async () => {
  const setupWorkspace = vi.fn();
  const runtime = new PluginServiceRuntime();
  const model = parseAppUIRuntimeModel({
    root: { type: "slot", id: "root", slotId: "main" },
    pluginInstances: {
      auth: { id: "auth", pluginId: "mock-auth-login", enabled: true },
      locale: { id: "locale", pluginId: "locale-provider", enabled: true },
      theme: { id: "theme", pluginId: "theme-provider", enabled: true },
      workspace: {
        id: "workspace", pluginId: "workspace", enabled: true,
        mount: { slotId: "main" },
      },
    },
  });
  try {
    runtime.reconcile(model, createPluginRegistry([
      mockAuthLoginPlugin, localeProviderPlugin, themeProviderPlugin,
      {
        manifest: {
          id: "workspace", name: "Workspace", description: "Test workspace", version: "1.0.0",
        },
        setup: setupWorkspace,
        Component: () => null,
      },
    ]), {
      sendMessage: async () => undefined,
      resumeInterrupts: async () => undefined,
      startNewConversation: async () => undefined,
      abortRun: () => undefined,
    });
    const session = runtime.get<AuthSessionService>(AUTH_SESSION_SERVICE);
    expect(session).toBeDefined();
    expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("blocked");
    expect(setupWorkspace).not.toHaveBeenCalled();

    await session!.login();
    expect(session!.getSnapshot().authenticated).toBe(true);
    expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("ready");
    expect(runtime.getActivation("workspace")?.status).toBe("active");

    session!.logout();
    expect(session!.getSnapshot().authenticated).toBe(false);
    expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("blocked");
    expect(runtime.getActivation("workspace")).toBeUndefined();
  } finally {
    runtime.dispose();
  }
});
