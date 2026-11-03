import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { AgentUILocaleProvider, AgentUIRoot } from "@za38.03/agent-ui-plugins";
import { HostUserProvider, type AgentUser } from "../../plugins/resources/registry/items/foundation/core/files/application/host-user";
import { AccountView } from "../../plugins/resources/registry/items/plugin/auth-account/files/plugins/auth-account";
import { authAccountPlugin } from "../../plugins/resources/registry/items/plugin/auth-account/files/plugins/auth-account/definition";
import { PluginServiceProvider, createPluginRegistry } from "../../plugins/resources/registry/items/foundation/core-runtime/files/runtime/plugins";
import { createAuthSession } from "../../plugins/resources/registry/items/plugin/auth-gate/files/plugins/auth-gate/session";
import { createDemoAuthAdapter } from "../../plugins/resources/registry/items/plugin/auth-gate/files/services/auth/mock-adapter";
import gateManifest from "../../plugins/resources/registry/items/plugin/auth-gate/files/plugins/auth-gate/manifest.json";
import { parseUIPluginManifest } from "../../creator/operator/src/framework/contracts/ui-plugin";

const actions = { sendMessage: async () => {}, resumeInterrupts: async () => {}, startNewConversation: async () => {}, abortRun() {} };
const model = { root: { type: "slot" as const, id: "main", slotId: "main" }, pluginInstances: {} };
const accountRegistry = createPluginRegistry([authAccountPlugin]);

it("displays Host profiles and localized signed-out defaults without an auth owner, and isolates Agent instances", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  function Account({ user, locale = "en-US" }: { user?: AgentUser | null | undefined; locale?: "en-US" | "zh-CN" }) {
    return <HostUserProvider user={user}>
      <PluginServiceProvider model={model} registry={accountRegistry} actions={actions}>
        <AgentUILocaleProvider locale={locale}><AgentUIRoot theme="light"><AccountView /></AgentUIRoot></AgentUILocaleProvider>
      </PluginServiceProvider>
    </HostUserProvider>;
  }
  async function render(user: AgentUser | null | undefined, locale: "en-US" | "zh-CN" = "en-US") {
    await act(async () => root.render(<><section data-host="one"><Account user={user} locale={locale} /></section><section data-host="two"><Account user={{ userId: "B", userName: "Bob" }} /></section></>));
  }
  try {
    await render({ userId: "A", userName: "Alice", avatar: "https://example.test/a.png" });
    const one = host.querySelector('[data-host="one"]')!;
    const two = host.querySelector('[data-host="two"]')!;
    expect(one.querySelector("strong")?.textContent).toBe("Alice");
    expect(one.querySelector(".auth-account-details > span")?.textContent).toBe("A");
    expect(one.querySelector("img")?.getAttribute("src")).toBe("https://example.test/a.png");
    expect(one.querySelector("button")).toBeNull();
    expect(two.textContent).toContain("Bob"); expect(two.textContent).not.toContain("Alice");
    await render({ userId: "C", userName: "Carol" });
    expect(one.querySelector("strong")?.textContent).toBe("Carol");
    expect(one.querySelector(".auth-account-details > span")?.textContent).toBe("C");
    expect(one.querySelector("img")).toBeNull();
    expect(one.querySelector(".auth-account-avatar svg")).not.toBeNull();
    const profiles: Array<{ user: AgentUser; name: string; id?: string; avatar?: string }> = [
      { user: {}, name: "Not signed in" },
      { user: { userId: "ID-only" }, name: "Not signed in", id: "ID-only" },
      { user: { userName: "Name only" }, name: "Name only" },
      { user: { avatar: "/avatar.png" }, name: "Not signed in", avatar: "/avatar.png" },
      { user: { userId: undefined, userName: undefined, avatar: undefined }, name: "Not signed in" },
      { user: { userId: " ", userName: " ", avatar: " " }, name: "Not signed in" },
    ];
    for (const profile of profiles) {
      await render(profile.user);
      expect(one.querySelector("strong")?.textContent).toBe(profile.name);
      expect(one.querySelector(".auth-account-details > span")?.textContent).toBe(profile.id);
      expect(one.querySelector("img")?.getAttribute("src")).toBe(profile.avatar);
      expect(one.querySelector(".auth-account-avatar svg") !== null).toBe(profile.avatar === undefined);
    }
    await render(null);
    expect(one.querySelector('[data-ui-plugin="auth-account"]')).not.toBeNull();
    expect(one.querySelector("strong")?.textContent).toBe("Not signed in");
    expect(one.querySelector(".auth-account-avatar svg")).not.toBeNull();
    expect(one.querySelector("img")).toBeNull();
    expect(one.querySelector(".auth-account-details > span")).toBeNull();
    expect(one.querySelector("button")).toBeNull();
    await render(null, "zh-CN");
    expect(one.querySelector("strong")?.textContent).toBe("未登录");
    await render(undefined, "zh-CN");
    expect(one.querySelector("strong")?.textContent).toBe("未登录");
    expect(two.textContent).toContain("Bob");
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("uses the existing session only when the Host user is omitted, with explicit null taking precedence", async () => {
  const adapter = createDemoAuthAdapter({ demo: true });
  const session = createAuthSession(adapter);
  await session.signIn({ account: "Legacy", password: "demo" });
  const registry = createPluginRegistry([authAccountPlugin, {
    manifest: parseUIPluginManifest(gateManifest), provides: ["auth.session", "auth.gate"],
    setup({ services }) { services.provide("auth.session", session); services.provide("auth.gate", session.gate); return () => session.dispose(); },
    Component: () => null,
  }]);
  const legacyModel = { ...model, pluginInstances: { gate: { id: "gate", pluginId: "auth-gate", enabled: true } } };
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  async function render(user: AgentUser | null | undefined) {
    await act(async () => root.render(<HostUserProvider user={user}>
      <PluginServiceProvider model={legacyModel} registry={registry} actions={actions}>
        <AgentUILocaleProvider locale="en-US"><AgentUIRoot theme="light"><AccountView /></AgentUIRoot></AgentUILocaleProvider>
      </PluginServiceProvider>
    </HostUserProvider>));
  }
  try {
    await render(undefined);
    expect(host.querySelector("strong")?.textContent).toBe("Legacy");
    expect(host.querySelector("button")).not.toBeNull();
    await render({ userId: "Host", userName: "Host profile" });
    expect(host.querySelector("strong")?.textContent).toBe("Host profile");
    expect(host.querySelector("button")).toBeNull();
    await render(null);
    expect(host.querySelector("strong")?.textContent).toBe("Not signed in");
    expect(host.textContent).not.toContain("Legacy");
    expect(host.querySelector("button")).toBeNull();
    await render(undefined);
    expect(host.querySelector("strong")?.textContent).toBe("Legacy");
    await act(async () => session.signOut());
    expect(host.querySelector("strong")?.textContent).toBe("Not signed in");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
