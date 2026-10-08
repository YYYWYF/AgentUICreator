import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseAppUIModel, buildLayoutRefIndex, type AppUIModel } from "../src/framework/contracts/app-ui-model";
import { compileAppUIModel } from "../src/framework/contracts/app-ui-compiler";
import { resolveAppUIComposition } from "../src/framework/contracts/app-ui-composition";
import { parseAppUIRuntimeModel } from "../src/framework/contracts/app-ui-runtime-model";
import { parseUIPluginManifest } from "../src/framework/contracts/ui-plugin";
import { applyAppUIOperations, appUIOperationSchema } from "../src/project/app-ui-operations";
import { satisfiesAgentUIPackageRange } from "../src/project/source-registry/inspector";
import { projectWorkspaceTopology } from "../src/project/workspace-topology";

const plugin = (id: string) => ({ id, pluginId: id, enabled: true });
function model(): AppUIModel { return { root: { type: "sidebar", defaultActive: null,
  items: [{ id: "history", child: { type: "slot", plugins: [plugin("history")] } }],
  content: { type: "row", sizes: ["minmax(0, 1fr)"], children: [{ type: "slot", plugins: [plugin("main"), plugin("files")] }] } } }; }
const catalog = { history: { sidebar: { icon: "messages-square" } }, files: { sidebar: { icon: "folder" } }, main: {} };
const op = (value: unknown) => appUIOperationSchema.parse(value);

describe("Sidebar contract and deterministic operations", () => {
  it("collects both branches and lowers Slots without plugin instance ids", () => {
    const source = model(); const runtime = compileAppUIModel(source, catalog);
    expect(compileAppUIModel(source, catalog)).toEqual(runtime);
    expect(runtime.root.type).toBe("sidebar");
    if (runtime.root.type !== "sidebar") throw new Error("Expected Sidebar");
    expect(runtime.root.items[0]!.child).toEqual({ type: "slot", id: "layout-node:root.items%5B0%5D.child", slotId: "layout-slot:root.items%5B0%5D.child" });
    expect(resolveAppUIComposition(runtime, catalog).issues).toEqual([]);
    expect(buildLayoutRefIndex(source.root).entries.map(entry => entry.path)).toEqual(["root", "root.items[0].child", "root.content", "root.content.children[0]"]);
  });
  it("rejects duplicate items, dangling defaults, multiple plugins and invalid navigation", () => {
    const source = model(); if (source.root.type !== "sidebar") throw new Error();
    source.root.defaultActive = "missing"; expect(() => parseAppUIModel(source)).toThrow();
    source.root.defaultActive = null; source.root.items.push(structuredClone(source.root.items[0]!)); expect(() => parseAppUIModel(source)).toThrow();
    source.root.items.pop(); source.root.items[0]!.child.plugins.push(plugin("files")); expect(() => parseAppUIModel(source)).toThrow();
    expect(() => compileAppUIModel(model(), { ...catalog, history: {} })).toThrow(/navigation/);
    const runtime = compileAppUIModel(model(), catalog); if (runtime.root.type !== "sidebar") throw new Error();
    runtime.root.defaultActive = "missing"; expect(() => parseAppUIRuntimeModel(runtime)).toThrow();
  });
  it("moves existing plugins in and out, reorders and sets defaults atomically", () => {
    const source = model();
    const moved = applyAppUIOperations(source, [op({ type: "insert_sidebar_item", sidebarRef: "l0", itemId: "files", instanceId: "files" }), op({ type: "reorder_sidebar_items", sidebarRef: "l0", itemIds: ["files", "history"] }), op({ type: "update_layout_node_props", nodeRef: "l0", set: { defaultActive: "files" } })]);
    expect(source).toEqual(model());
    if (moved.root.type !== "sidebar") throw new Error();
    expect(moved.root.items.map(item => item.id)).toEqual(["files", "history"]);
    const refs = buildLayoutRefIndex(moved.root);
    const destination = refs.byPath.get("root.content.children[0]")!;
    const restored = applyAppUIOperations(moved, [op({ type: "move_plugin", instanceId: "files", target: { type: "layout_slot", slotRef: destination } })]);
    if (restored.root.type !== "sidebar") throw new Error();
    expect(restored.root.defaultActive).toBeNull(); expect(restored.root.items).toHaveLength(1);
    expect(() => parseAppUIModel(applyAppUIOperations(source, [op({ type: "update_layout_node_props", nodeRef: "l0", set: { defaultActive: "missing" } })]))).toThrow();
    expect(() => applyAppUIOperations(source, [op({ type: "reorder_sidebar_items", sidebarRef: "l0", itemIds: ["files"] })])).toThrow();
  });
  it("removes an entry and supports materializing a new Sidebar", () => {
    const removed = applyAppUIOperations(model(), [op({ type: "remove_sidebar_item", sidebarRef: "l0", itemId: "history" })]);
    if (removed.root.type !== "sidebar") throw new Error(); expect(removed.root.items).toEqual([]);
    const empty: AppUIModel = { root: { type: "slot", plugins: [] } };
    const replaced = applyAppUIOperations(empty, [op({ type: "replace_layout_node", nodeRef: "l0", node: model().root })]);
    expect(replaced).toEqual(model());
  });
  it("preserves Sidebar Slot local refs across an atomic mutation batch", () => {
    const source: AppUIModel = { root: { type: "slot", plugins: [] } };
    const node = { type: "sidebar", localRef: "$sidebar", defaultActive: "history", items: [{ id: "history", child: { type: "slot", localRef: "$history", plugins: [plugin("history")] } }], content: { type: "slot", plugins: [] } };
    const result = applyAppUIOperations(source, [
      op({ type: "replace_layout_node", nodeRef: "l0", node }),
      op({ type: "update_layout_node_props", nodeRef: "$sidebar", set: { defaultActive: null } }),
      op({ type: "insert_plugin", target: { type: "layout_slot", slotRef: "$history" }, plugin: plugin("files") }),
      op({ type: "remove_plugin", instanceId: "history" }),
    ]);
    expect(parseAppUIModel(result).root.type).toBe("sidebar");
    expect(JSON.stringify(result)).not.toContain("localRef");
    expect(source.root.type).toBe("slot");
    expect(() => parseAppUIModel(applyAppUIOperations(source, [op({ type: "replace_layout_node", nodeRef: "l0", node: { ...node, defaultActive: "missing" } })]))).toThrow();
    expect(source.root.type).toBe("slot");
  });
  it.each([
    { type: "slot", plugins: [] },
    { type: "slot", plugins: [plugin("history"), plugin("files")] },
    { type: "row", children: [] },
    { type: "column", children: [] },
    { type: "stack", children: [] },
    { type: "panel", child: { type: "slot", plugins: [] } },
  ])("rejects invalid Sidebar mutation children: %j", child => {
    expect(() => op({ type: "replace_layout_node", nodeRef: "l0", node: {
      type: "sidebar", defaultActive: null, items: [{ id: "history", child }], content: { type: "slot", plugins: [] },
    } })).toThrow();
  });
  it("requires Sidebar-capable package versions in Source Registry", () => {
    for (const [item, name, oldVersion, version] of [
      ["foundation-core", "@agent-ui/react", "0.1.1", "0.1.2"],
      ["foundation-core-contracts", "@agent-ui/runtime-react", "0.1.0", "0.1.1"],
    ]) {
      const descriptor = JSON.parse(readFileSync(new URL(`../../source-registry/registry/items/${item}/item.json`, import.meta.url), "utf8"));
      expect(satisfiesAgentUIPackageRange(oldVersion, descriptor.packages[name!])).toBe(false);
      expect(satisfiesAgentUIPackageRange(version, descriptor.packages[name!])).toBe(true);
    }
  });
  it("validates icons without interpreting code and preserves locale fallbacks", () => {
    const manifest = { id: "test", name: "Test", description: "Test", version: "1.0.0", sidebar: { icon: "folder", labels: { "zh-CN": "文件" } } };
    expect(parseUIPluginManifest(manifest).sidebar?.icon).toBe("folder");
    expect(() => parseUIPluginManifest({ ...manifest, sidebar: { icon: "eval(code)" } })).toThrow();
  });
  it("keeps old models valid and projects Sidebar content for Workspace operations", () => {
    expect(parseAppUIModel({ root: { type: "row", children: [] } }).root.type).toBe("row");
    const topology = projectWorkspaceTopology(model(), { regions: { center: { required: true, track: "minmax(0, 1fr)" } } });
    expect(topology.rootRef).toBe("l2");
    expect(topology.regions.center?.branchRef).toBe("l3");
  });
  it.each(["platform", "assistant", "embedded"])("validates the %s preset", mode => {
    const preset = parseAppUIModel(JSON.parse(readFileSync(new URL(`../../bootstrap/presets/${mode}/app-ui.json`, import.meta.url), "utf8")));
    expect(preset.root.type).toBe(mode === "embedded" ? "row" : "sidebar");
    if (preset.root.type === "sidebar") {
      expect(preset.root.defaultActive).toBeNull();
      expect(preset.root.content.type).toBe("row");
      if (preset.root.content.type === "row" && mode === "platform") expect(preset.root.content.responsive).toMatchObject({ primaryIndex: 0, drawerIndex: 1 });
    }
  });
});
