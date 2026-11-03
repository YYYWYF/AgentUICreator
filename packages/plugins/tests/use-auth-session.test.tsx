// @vitest-environment jsdom
import * as React from "react";
import * as JSXRuntime from "react/jsx-runtime";
import { act, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import * as Plugins from "@za38.03/agent-ui-plugins";
import * as AuthGate from "../dist/auth-gate/index.js";
import * as AuthAccount from "../dist/auth-account/index.js";
import { PluginServiceRuntimeProvider } from "../src/plugin-api/PluginServiceContext";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type AuthView = {
  snapshot: AuthGate.AuthSessionSnapshot;
  session: Pick<AuthGate.AuthSessionService, "signIn" | "signOut"> | undefined;
  serviceAvailable: boolean;
};
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

async function loadTemplate(relative: string, modules: Record<string, unknown>) {
  const source = await readFile(new URL(relative, import.meta.url), "utf8");
  // Use Node's encoding realm for the template compiler, matching delivery tests.
  const code = execFileSync(process.execPath, ["-e",
    'const {transformSync}=require(process.argv[1]);process.stdout.write(transformSync(require("node:fs").readFileSync(0,"utf8"),{loader:"tsx",format:"cjs",jsx:"automatic"}).code);',
    createRequire(import.meta.url).resolve("esbuild"),
  ], { input: source, encoding: "utf8" });
  const output = { exports: {} };
  new Function("require", "module", "exports", code)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected template dependency: ${name}`);
    return modules[name];
  }, output, output.exports);
  return output.exports;
}

async function loadHook() {
  return await loadTemplate("../src/shared/project/services/hooks/useAuthSession.ts", {
    react: React,
    "@za38.03/agent-ui-plugins": Plugins,
    "../auth/session": { AUTH_SESSION_SERVICE: "auth.session" },
  }) as { useAuthSession(): AuthView };
}

function observable(userName: string) {
  let snapshot: AuthGate.AuthSessionSnapshot = {
    status: "authenticated", user: { userId: userName, userName }, busy: false, error: null,
  };
  const listeners = new Set<() => void>();
  const service = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    signIn: vi.fn(async (_input: { account: string; password: string }) => {}),
    signOut: vi.fn(async () => {}), restore: vi.fn(), dispose: vi.fn(),
  };
  return { service, listeners, update(next: AuthGate.AuthSessionSnapshot) {
    snapshot = next; listeners.forEach(listener => listener());
  } };
}

function registry(initial?: ReturnType<typeof observable>["service"]) {
  let service = initial, revision = 0;
  const listeners = new Set<() => void>();
  return {
    listeners,
    port: {
      get: <T,>(name: string) => { expect(name).toBe("auth.session"); return service as T | undefined; },
      subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      getRevision: () => revision,
    },
    replace(next: typeof service) { service = next; revision++; listeners.forEach(listener => listener()); },
  };
}

async function mount(content: ReactNode) {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(content));
  return host;
}

it("shares auth state, forwards actions and errors, and cleans up subscriptions through service replacement", async () => {
  const { useAuthSession } = await loadHook();
  const services = registry();
  const first = observable("first"), second = observable("second");
  const views: AuthView[] = [];
  function Consumer({ index }: { index: number }) {
    const view = useAuthSession(); views[index] = view;
    return <span>{view.snapshot.user?.userName}</span>;
  }
  const host = await mount(<PluginServiceRuntimeProvider runtime={services.port}><Consumer index={0} /><Consumer index={1} /></PluginServiceRuntimeProvider>);
  expect(views[0]!.serviceAvailable).toBe(false);
  expect(views[0]!.session).toBeUndefined();
  const fallback = views[0]!.snapshot;
  expect(fallback).toEqual({ status: "checking", user: null, busy: false, error: null });
  await act(async () => services.replace(first.service));
  expect(first.listeners.size).toBe(2);
  expect(views[0]!.snapshot).toBe(views[1]!.snapshot);
  const actions = views[0]!.session!;
  expect(Object.keys(actions).sort()).toEqual(["signIn", "signOut"]);
  await actions.signIn({ account: "user", password: "secret" });
  expect(first.service.signIn).toHaveBeenCalledExactlyOnceWith({ account: "user", password: "secret" });
  await actions.signOut(); expect(first.service.signOut).toHaveBeenCalledOnce();
  const failure = new Error("adapter unavailable");
  first.service.signIn.mockRejectedValueOnce(failure);
  await expect(actions.signIn({ account: "user", password: "retry" })).rejects.toBe(failure);
  await act(async () => first.update({ status: "anonymous", user: null, busy: false, error: "sign-in-failed" }));
  expect(views[0]!.snapshot.error).toBe("sign-in-failed");
  expect(views[0]!.session).toBe(actions);
  await act(async () => services.replace(second.service));
  expect(first.listeners.size).toBe(0);
  expect(second.listeners.size).toBe(2);
  expect(host.textContent).toBe("secondsecond");
  await views[0]!.session!.signOut(); expect(second.service.signOut).toHaveBeenCalledOnce();
  await act(async () => services.replace(undefined));
  expect(second.listeners.size).toBe(0);
  expect(views[0]!.snapshot).toBe(fallback);
  expect(views[0]!.session).toBeUndefined();
  await act(async () => services.replace(second.service));
  await act(async () => root!.unmount()); root = undefined;
  expect(second.listeners.size).toBe(0);
  expect(services.listeners.size).toBe(0);
  for (const item of [first, second]) {
    expect(item.service.restore).not.toHaveBeenCalled();
    expect(item.service.dispose).not.toHaveBeenCalled();
  }
});

it.each([undefined, null, { userId: "host", userName: "Host identity" }])("preserves Host identity %s and application prop overrides", async hostUser => {
  const hook = await loadHook();
  const modules = {
    react: React, "react/jsx-runtime": JSXRuntime,
    "../../services/hooks/useAuthSession": hook,
    "@za38.03/agent-ui-plugins/auth-account": AuthAccount,
    "@za38.03/agent-ui-runtime/ui/application/host-user": { useHostUser: () => hostUser },
  };
  const { AuthAccountPlugin: Account } = await loadTemplate("../src/plugins/auth-account/adapters/application.tsx", modules) as {
    AuthAccountPlugin: ComponentType<ComponentProps<typeof AuthAccount.AuthAccountPlugin>>;
  };
  const service = observable("Session identity"), services = registry(service.service);
  function Tree({ user = hostUser }: { user?: typeof hostUser }) {
    return <PluginServiceRuntimeProvider runtime={services.port}><Plugins.AgentUIRoot theme="light"><Plugins.AgentUILocaleProvider locale="en-US"><Account hostUser={user} className="project-account" /></Plugins.AgentUILocaleProvider></Plugins.AgentUIRoot></PluginServiceRuntimeProvider>;
  }
  const host = await mount(<Tree />);
  expect(host.querySelector(".project-account")).not.toBeNull();
  expect(host.textContent).toContain(hostUser === undefined ? "Session identity" : hostUser === null ? "Not signed in" : "Host identity");
  if (hostUser !== undefined) expect(host.querySelector("button")).toBeNull();
  await act(async () => root!.render(<Tree user={{ userId: "override", userName: "Application override" }} />));
  expect(host.textContent).toContain("Application override");
});
