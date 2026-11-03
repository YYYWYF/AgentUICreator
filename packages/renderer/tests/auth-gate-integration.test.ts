import { describe, expect, it, vi } from "vitest";
import { createAuthSession } from "../../plugins/resources/registry/items/plugin/auth-gate/files/plugins/auth-gate/session";
import { createDemoAuthAdapter } from "../../plugins/resources/registry/items/plugin/auth-gate/files/services/auth/mock-adapter";
import { createPluginRegistry, PluginServiceRuntime } from "../../plugins/resources/registry/items/foundation/core-runtime/files/runtime/plugins";
import { parseAppUIRuntimeModel } from "../../creator/operator/src/framework/contracts/app-ui-runtime-model";
import { parseUIPluginManifest } from "../../creator/operator/src/framework/contracts/ui-plugin";
import gateManifest from "../../plugins/resources/registry/items/plugin/auth-gate/files/plugins/auth-gate/manifest.json";
import accountManifest from "../../plugins/resources/registry/items/plugin/auth-account/files/plugins/auth-account/manifest.json";
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

it("withdraws a live application gate safely and reconnects it on the next reconciliation", () => {
  const listeners = new Set<() => void>(), cleanup = vi.fn();
  let withdraw: (() => void) | undefined;
  const gate = { getSnapshot: () => ({ status: "ready" as const }), subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  const registry = createPluginRegistry([
    { manifest: parseUIPluginManifest(gateManifest), provides: ["auth.gate", "auth.session"], setup({ services }) { withdraw = services.provide("auth.gate", gate); services.provide("auth.session", {}); }, Component: () => null },
    { manifest: parseUIPluginManifest(accountManifest), inject: ["auth.session"], setup: () => cleanup, Component: () => null },
  ]);
  const runtime = new PluginServiceRuntime(); runtime.reconcile(model(), registry, actions);
  const previous = runtime.getActivation("account");
  expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("ready"); expect(listeners.size).toBe(1);
  withdraw?.(); withdraw?.();
  expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("error");
  expect(runtime.getActivation("account")).toBeUndefined(); expect(cleanup).toHaveBeenCalledOnce(); expect(listeners.size).toBe(0);
  runtime.reconcile(model(), registry, actions);
  expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("ready"); expect(listeners.size).toBe(1);
  const replacement = runtime.getActivation("account");
  if (previous?.status === "active" && replacement?.status === "active") expect(replacement.activationId).toBeGreaterThan(previous.activationId);
  else expect(replacement?.status).toBe("active");
  runtime.dispose(); expect(listeners.size).toBe(0); expect(cleanup).toHaveBeenCalledTimes(2);
});
