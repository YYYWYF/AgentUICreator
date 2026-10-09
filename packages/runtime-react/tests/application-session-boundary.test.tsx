import { useEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ApplicationSessionBoundary, useApplicationSessionConnection } from "../../source-registry/registry/items/foundation-core/files/application/ApplicationSessionBoundary";
import { createAuthSession } from "../../source-registry/registry/items/plugin-auth-gate/files/plugins/auth-gate/session";
import { createDemoAuthAdapter } from "../../source-registry/registry/items/plugin-auth-gate/files/services/auth/mock-adapter";
import { createPluginRegistry } from "../../source-registry/registry/items/foundation-core-runtime/files/runtime/plugins";
import { AppFrontendToolRegistry, AppFrontendToolRuntime } from "../../source-registry/registry/items/foundation-core-runtime/files/runtime/tools";
import gateManifest from "../../source-registry/registry/items/plugin-auth-gate/files/plugins/auth-gate/manifest.json";
import { parseUIPluginManifest } from "../../project-control/src/framework/contracts/ui-plugin";

it("starts no conversation subtree while blocked and disposes it across logout and identity changes", async () => {
  const adapter = createDemoAuthAdapter({ demo: true }); const session = createAuthSession(adapter);
  const setup = vi.fn(({ services }) => { services.provide("auth.gate", session.gate); services.provide("auth.session", session); return () => session.dispose(); });
  const registry = createPluginRegistry([{ manifest: parseUIPluginManifest(gateManifest), provides: ["auth.gate", "auth.session"], setup, Component: () => <button>Login</button> }]);
  const composition = { runtimeModel: { root: { type: "slot", id: "main", slotId: "main" }, pluginInstances: { gate: { id: "gate", pluginId: "auth-gate", enabled: true } } }, activeRegistry: registry } as any;
  const frontendTools = new AppFrontendToolRuntime(new AppFrontendToolRegistry([]));
  const abort = vi.fn(); const mounts = vi.fn(); const cleanups = vi.fn();
  const dispose = vi.fn(); let runtime = { abort, dispose } as any;
  function ConversationProbe() { useApplicationSessionConnection(runtime); useEffect(() => { mounts(); return cleanups; }, []); return <div>Conversation</div>; }
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<ApplicationSessionBoundary composition={composition} frontendTools={frontendTools}><ConversationProbe /></ApplicationSessionBoundary>));
    await act(async () => { await session.restore(); });
    expect(mounts).not.toHaveBeenCalled(); expect(host.textContent).toContain("Login");
    await act(async () => { await session.signIn({ account: "A", password: "demo" }); });
    expect(mounts).toHaveBeenCalledTimes(1);
    runtime = { abort, dispose } as any;
    await act(async () => root.render(<ApplicationSessionBoundary composition={composition} frontendTools={frontendTools}><ConversationProbe /></ApplicationSessionBoundary>));
    expect(abort).not.toHaveBeenCalled(); // Ordinary thread bridge changes retain existing run policy.
    await act(async () => { await session.signOut(); });
    expect(abort).toHaveBeenCalled(); expect(dispose).toHaveBeenCalled(); expect(cleanups).toHaveBeenCalledTimes(1); expect(host.textContent).not.toContain("Conversation");
    await act(async () => { await session.signIn({ account: "B", password: "demo" }); }); expect(mounts).toHaveBeenCalledTimes(2);
    await act(async () => { adapter.updateUser({ id: "C", displayName: "C" }); await Promise.resolve(); });
    expect(mounts).toHaveBeenCalledTimes(3); expect(cleanups).toHaveBeenCalledTimes(2);
    expect(setup).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("preserves the original ungated conversation lifetime through composition updates", async () => {
  const mounts = vi.fn(); const cleanups = vi.fn();
  function Probe() { useEffect(() => { mounts(); return cleanups; }, []); return <div>Ungated</div>; }
  const registry = createPluginRegistry([]);
  const composition = { runtimeModel: { root: { type: "slot", id: "main", slotId: "main" }, pluginInstances: {} }, activeRegistry: registry } as any;
  const tools = new AppFrontendToolRuntime(new AppFrontendToolRegistry([]));
  const host = document.createElement("div"); const root = createRoot(host);
  try {
    await act(async () => root.render(<ApplicationSessionBoundary composition={composition} frontendTools={tools}><Probe /></ApplicationSessionBoundary>));
    await act(async () => root.render(<ApplicationSessionBoundary composition={{ ...composition }} frontendTools={tools}><Probe /></ApplicationSessionBoundary>));
    expect(mounts).toHaveBeenCalledTimes(1); expect(cleanups).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});
