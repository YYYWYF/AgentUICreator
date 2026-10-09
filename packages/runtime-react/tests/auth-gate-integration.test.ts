import { describe, expect, it, vi } from "vitest";
import { createAuthSession } from "../../source-registry/registry/items/plugin-auth-gate/files/plugins/auth-gate/session";
import { createDemoAuthAdapter } from "../../source-registry/registry/items/plugin-auth-gate/files/services/auth/mock-adapter";
import { createPluginRegistry, PluginServiceRuntime } from "../../source-registry/registry/items/foundation-core-runtime/files/runtime/plugins";
import { parseAppUIRuntimeModel } from "../../project-control/src/framework/contracts/app-ui-runtime-model";
import { parseUIPluginManifest } from "../../project-control/src/framework/contracts/ui-plugin";
import gateManifest from "../../source-registry/registry/items/plugin-auth-gate/files/plugins/auth-gate/manifest.json";
import accountManifest from "../../source-registry/registry/items/plugin-auth-account/files/plugins/auth-account/manifest.json";
const actions = { sendMessage: async () => {}, resumeInterrupts: async () => {}, startNewConversation: async () => {}, abortRun() {} };
function model(account = true) {
  return parseAppUIRuntimeModel({ root: { type: "slot", id: "main", slotId: "main" }, pluginInstances: {
    gate: { id: "gate", pluginId: "auth-gate", enabled: true },
    ...(account ? { account: { id: "account", pluginId: "auth-account", enabled: true, mount: { slotId: "main" } } } : {}),
  } });
}
it("keeps one Foundation session across login, account hide, expiry and relogin", async () => {
  const adapter = createDemoAuthAdapter({ demo: true }); const session = createAuthSession(adapter);
  const setup = vi.fn(({ services }) => { services.provide("auth.gate", session.gate); services.provide("auth.session", session); return () => session.dispose(); });
  const accountSetup = vi.fn();
  const registry = createPluginRegistry([
    { manifest: parseUIPluginManifest(gateManifest), provides: ["auth.gate", "auth.session"], setup, Component: () => null },
    { manifest: parseUIPluginManifest(accountManifest), inject: ["auth.session"], setup: accountSetup, Component: () => null },
  ]);
  const runtime = new PluginServiceRuntime(); runtime.reconcile(model(), registry, actions);
  expect(runtime.get("auth.session")).toBe(session); expect(runtime.get("auth.gate")).toBe(session.gate);
  expect(accountSetup).not.toHaveBeenCalled();
  await session.restore(); expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("blocked");
  await session.signIn({ account: "A", password: "demo" }); expect(runtime.getActivation("account")?.status).toBe("active");
  runtime.reconcile(model(false), registry, actions); expect(runtime.get("auth.session")).toBe(session); expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("ready");
  adapter.updateUser(null); expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("blocked");
  await session.signIn({ account: "B", password: "demo" }); runtime.reconcile(model(), registry, actions);
  expect(runtime.getActivation("account")?.status).toBe("active"); expect(setup).toHaveBeenCalledTimes(1);
  runtime.dispose(); expect(session.getSnapshot().user).toBeNull();
});
it("keeps account pending when its owner is absent and rejects duplicate owners", () => {
  const account = { manifest: parseUIPluginManifest(accountManifest), inject: ["auth.session"], Component: () => null };
  const without = model(); delete without.pluginInstances.gate;
  const runtime = new PluginServiceRuntime(); runtime.reconcile(without, createPluginRegistry([account]), actions);
  expect(runtime.getActivation("account")?.status).toBe("pending"); runtime.dispose();
  const duplicate = model(false); duplicate.pluginInstances.other = { id: "other", pluginId: "auth-gate", enabled: true };
  const registry = createPluginRegistry([{ manifest: parseUIPluginManifest(gateManifest), provides: ["auth.gate", "auth.session"], setup({ services }) { const session = createAuthSession(createDemoAuthAdapter({ demo: true })); services.provide("auth.gate", session.gate); services.provide("auth.session", session); return () => session.dispose(); }, Component: () => null }]);
  const second = new PluginServiceRuntime(); second.reconcile(duplicate, registry, actions);
  expect(second.applicationLifecycle.getSnapshot().phase).toBe("error"); second.dispose();
});
