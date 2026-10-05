import { describe, expect, it, vi } from "vitest";
import type { ConversationToolkit } from "@agent-ui/react";
import type { UIPluginDefinition } from "../../../project-control/src/framework/contracts/ui-plugin";
import { createPluginCapabilityCatalog, createRuntimeCompositionStore, type RuntimeCompositionStore } from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/composition/index";

const base: ConversationToolkit = {
  search_files: { type: "backend", display: "standalone", render: () => null },
};
function plugin(id: string, toolName: string): UIPluginDefinition {
  return {
    manifest: { id, name: id, description: id, version: "1.0.0", capabilities: ["headless"] },
    toolkit: { [toolName]: { type: "backend", display: "standalone", render: () => null } },
    Component: () => null,
  };
}
function stage(store: RuntimeCompositionStore, plugins: UIPluginDefinition[]) {
  store.stageCandidate({
    baseConversationToolkit: base,
    appUIModelSource: JSON.stringify({
      applicationPlugins: plugins.map(p => ({ id: p.manifest.id, pluginId: p.manifest.id, enabled: true })),
      root: { type: "slot", plugins: [] },
    }),
    capabilityCatalogRevision: "a".repeat(64),
    capabilityCatalog: createPluginCapabilityCatalog(plugins.map(p => ({
      manifest: p.manifest, provides: [], inject: [], optionalInject: [], loadDefinition: async () => p,
    }))),
  });
}

describe("final Conversation Toolkit candidate validation", () => {
  it("publishes one validated stable toolkit containing base, web_search and search_docs", async () => {
    const store = createRuntimeCompositionStore();
    stage(store, [plugin("web-search", "web_search"), plugin("retrieval-chunks", "search_docs")]);
    await vi.waitFor(() => expect(store.getCandidateDiagnostic()?.status).toBe("resolved"));
    const snapshot = store.getSnapshot()!;
    expect(Object.keys(snapshot.conversationToolkit).sort()).toEqual(["search_docs", "search_files", "web_search"]);
    expect(snapshot.conversationToolkit.search_files).toBe(base.search_files);
    expect(store.getSnapshot()!.conversationToolkit).toBe(snapshot.conversationToolkit);
  });

  it.each([
    ["plugin/base", [plugin("collision", "search_files")], "search_files"],
    ["plugin/plugin", [plugin("first", "web_search"), plugin("second", "web_search")], "web_search"],
  ] as const)("rejects %s collisions before publication and keeps the rendered composition", async (_kind, conflicting, toolName) => {
    const store = createRuntimeCompositionStore();
    stage(store, [plugin("web-search", "web_search"), plugin("retrieval-chunks", "search_docs")]);
    await vi.waitFor(() => expect(store.getSnapshot()).toBeDefined());
    const previous = store.getSnapshot();
    // A render consumer is notified only of successfully published snapshots.
    const renderConsumer = vi.fn();
    const unsubscribe = store.subscribe(renderConsumer);
    stage(store, [...conflicting]);
    await vi.waitFor(() => expect(store.getCandidateDiagnostic()?.status).toBe("error"));
    expect(store.getCandidateDiagnostic()?.errorMessage).toBe(`Duplicate Tool UI registration: ${toolName}`);
    expect(store.getSnapshot()).toBe(previous);
    expect(renderConsumer).not.toHaveBeenCalled();
    unsubscribe();
  });
});
