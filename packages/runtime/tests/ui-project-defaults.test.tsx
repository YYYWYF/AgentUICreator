// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createAgentUIProject, createPluginCapabilityCatalog, resolveAgentUIProjectResources } from "../src/ui/index.js";

const required = {
  appUIModelSource: JSON.stringify({ root: { type: "stack", children: [] } }),
  pluginCapabilityCatalog: createPluginCapabilityCatalog([]), capabilityCatalogRevision: "a".repeat(64),
};
describe("npm project defaults", () => {
  it("keeps each project's overrides isolated and leaves example tools unregistered", () => {
    const custom = createAgentUIProject({ ...required, defaultLocale: "en-US", locales: {
      "en-US": { composer: { placeholder: "My business input" } }, "zh-CN": {},
    }, getConversationStarterSuggestions: () => [{ title: "My business question", prompt: "My business question" }], presentation: { welcome: { title: "My app" } } });
    const defaults = createAgentUIProject(required);
    expect(custom.getConversationStarterSuggestions("en-US")[0]?.title).toBe("My business question");
    expect(defaults.getConversationStarterSuggestions("en-US")).toEqual([]);
    expect(defaults.baseConversationToolkit).toEqual({});
    expect(defaults.appFrontendTools).toEqual([]);
    expect(defaults.presentation.welcome).toEqual({});
    expect(defaults).not.toHaveProperty("theme");
    expect(defaults.compositionStore).not.toBe(custom.compositionStore);
  });
  it("binds explicitly installed resources and rejects ambiguous generated outputs", () => {
    const Integrations = ({ children }: { children: import("react").ReactNode }) => children;
    const modules = { tools: { generatedFrontendTools: [] }, ui: { generatedFrontendToolUIs: {} }, integrations: { GeneratedConversationIntegrations: Integrations } };
    expect(createAgentUIProject({ ...required, ...resolveAgentUIProjectResources(modules) }).Integrations).toBe(Integrations);
    expect(resolveAgentUIProjectResources({})).toEqual({});
    expect(() => resolveAgentUIProjectResources({ first: modules.tools, second: modules.tools })).toThrow("Duplicate Agent UI resource export");
  });
  it("restores the last published composition through the bundler HMR port", async () => {
    const data: Record<string, unknown> = {};
    const disposals: (() => void)[] = [];
    const hot = { data, dispose(callback: () => void) { disposals.push(callback); } };
    const first = createAgentUIProject({ ...required, hot });
    await first.compositionStore.stageCandidate({ appUIModelSource: required.appUIModelSource, capabilityCatalog: required.pluginCapabilityCatalog, capabilityCatalogRevision: required.capabilityCatalogRevision });
    await vi.waitFor(() => expect(first.compositionStore.getCandidateDiagnostic()?.status).toBe("resolved"));
    const snapshot = first.compositionStore.getSnapshot();
    expect(snapshot).toBeDefined();
    disposals.forEach(dispose => dispose());
    const next = createAgentUIProject({ ...required, hot });
    expect(next.compositionStore.getSnapshot()).toBe(snapshot);
    await next.compositionStore.stageCandidate({ appUIModelSource: "invalid", capabilityCatalog: required.pluginCapabilityCatalog, capabilityCatalogRevision: required.capabilityCatalogRevision });
    await vi.waitFor(() => expect(next.compositionStore.getCandidateDiagnostic()?.status).toBe("error"));
    expect(next.compositionStore.getSnapshot()).toBe(snapshot);
    disposals.forEach(dispose => dispose());
  });
});
