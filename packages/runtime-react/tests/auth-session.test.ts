import { describe, expect, it, vi } from "vitest";
import { createAuthSession } from "../../source-registry/registry/items/plugin-auth-gate/files/plugins/auth-gate/session";
import { createDemoAuthAdapter } from "../../source-registry/registry/items/plugin-auth-gate/files/services/auth/mock-adapter";
import { createHostAuthAdapter } from "../../source-registry/registry/items/plugin-auth-gate/files/services/auth/adapter";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "../../source-registry/src/index";

const credentials = (account = "A") => ({ account, password: "demo" });
describe("optional authentication source and single session", () => {
  it("restores, rejects recoverable credentials, signs in, updates profiles, signs out", async () => {
    const adapter = createDemoAuthAdapter({ demo: true }); const session = createAuthSession(adapter);
    const listener = vi.fn(); session.subscribe(listener);
    const initial = session.getSnapshot(); expect(session.getSnapshot()).toBe(initial);
    await session.restore(); expect(session.gate.getSnapshot().status).toBe("blocked");
    await session.signIn({ account: "A", password: "wrong" });
    expect(session.getSnapshot().error).toBe("sign-in-failed"); expect(session.gate.getSnapshot().status).toBe("blocked");
    await session.signIn(credentials()); expect(session.gate.getSnapshot().status).toBe("ready");
    adapter.updateUser({ id: "A", displayName: "Updated", email: "a@example.test" });
    expect(session.getSnapshot().user?.displayName).toBe("Updated"); expect(listener).toHaveBeenCalled();
    await session.signOut(); expect(session.getSnapshot().user).toBeNull(); expect(session.gate.getSnapshot().status).toBe("blocked");
    await session.signIn(credentials("B")); expect(session.getSnapshot().user?.id).toBe("B");
    session.dispose(); adapter.updateUser({ id: "B", displayName: "Late" }); expect(session.getSnapshot().user).toBeNull();
  });
  it("fails closed without a Host adapter or when restore fails", async () => {
    const missing = createAuthSession(createHostAuthAdapter()); await missing.restore(); expect(missing.gate.getSnapshot()).toEqual({ status: "error", message: "AUTH_INITIALIZATION_FAILED" });
    const failed = createAuthSession(createDemoAuthAdapter({ demo: true, failRestore: true })); await failed.restore(); expect(failed.gate.getSnapshot().status).toBe("error");
  });
  it("revokes immediately even if remote logout fails and ignores a stale restore", async () => {
    let finish!: (user: { id: string; displayName: string }) => void;
    const session = createAuthSession({ restore: () => new Promise(resolve => { finish = resolve; }), signIn: async () => ({ id: "B", displayName: "B" }), signOut: async () => { throw new Error("secret server detail"); } });
    const restoring = session.restore(); await session.signIn(credentials("B")); finish({ id: "A", displayName: "A" }); await restoring;
    expect(session.getSnapshot().user?.id).toBe("B");
    const logout = session.signOut(); expect(session.gate.getSnapshot().status).toBe("blocked"); await logout;
    expect(session.getSnapshot()).toMatchObject({ user: null, error: "sign-out-failed" }); expect(JSON.stringify(session.getSnapshot())).not.toContain("secret");
  });
  it("expiry invalidates a pending login and identity changes cross blocked before ready", async () => {
    let notify!: (user: { id: string; displayName: string } | null) => void;
    let finish!: (user: { id: string; displayName: string }) => void;
    const session = createAuthSession({ restore: async () => ({ id: "A", displayName: "A" }), subscribe(listener) { notify = listener; return () => {}; }, signIn: () => new Promise(resolve => { finish = resolve; }), signOut: async () => {} });
    await session.restore(); const states: string[] = []; session.subscribe(() => states.push(session.gate.getSnapshot().status));
    notify({ id: "B", displayName: "B" }); expect(session.gate.getSnapshot().status).toBe("blocked"); await Promise.resolve(); expect(states).toEqual(["blocked", "ready"]);
    const login = session.signIn(credentials()); notify(null); finish({ id: "A", displayName: "A" }); await login; expect(session.getSnapshot().user).toBeNull();
  });
  it("stores only display data in an explicitly isolated demo, restores on refresh", async () => {
    const data = new Map<string, string>(); const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
    const a = createAuthSession(createDemoAuthAdapter({ demo: true, storage, storageKey: "one" })); await a.signIn(credentials());
    const fresh = createAuthSession(createDemoAuthAdapter({ demo: true, storage, storageKey: "one" })); await fresh.restore(); expect(fresh.getSnapshot().user?.id).toBe("A");
    const other = createAuthSession(createDemoAuthAdapter({ demo: true, storage, storageKey: "two" })); await other.restore(); expect(other.getSnapshot().user).toBeNull();
    expect(JSON.stringify([...data.values()])).not.toContain("demo");
    const adapter = createDemoAuthAdapter({ demo: true, storage, storageKey: "public-only" });
    adapter.updateUser({ id: "A", displayName: "A", token: "private-token" } as any);
    expect(data.get("public-only")).not.toContain("private-token");
  });
  it("account source closure includes the unique owner without editing presets", async () => {
    const registry = await loadAgentUISourceRegistry();
    const closure = resolveAgentUISourceItemClosure(registry, "plugin/auth-account");
    expect(closure.map(item => item.id)).toContain("plugin/auth-gate");
  });
});
