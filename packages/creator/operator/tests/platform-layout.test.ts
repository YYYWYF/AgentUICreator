import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLayoutRefIndex, collectAppUIPluginLocations, parseAppUIModel } from "../src/framework/contracts/app-ui-model";
import { applyAppUIOperations } from "../src/project/app-ui-operations";

const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const preset = JSON.parse(await readFile(path.join(repo, "packages/creator/operator/presets/platform/app-ui.json"), "utf8"));

describe("Platform layout ownership", () => {
  it("moves navigation between left and right by changing only the model, preserving instances, tracks and drawer identity", () => {
    const source = structuredClone(preset);
    let nextId = 0;
    const assignExplicitIds = (value: any): void => {
      if (!value || typeof value !== "object") return;
      if (value.pluginId) value.id = `instance-${nextId++}`;
      Object.values(value).forEach(assignExplicitIds);
    };
    assignExplicitIds(source);
    let model = parseAppUIModel(source);
    const identities = collectAppUIPluginLocations(model).map(({ plugin }) => plugin.id).sort();
    for (const index of [1, 0]) {
      if (model.root.type !== "row") throw new Error("Platform must use Row composition");
      const nav = model.root.children[model.root.responsive!.drawerIndex]!;
      const refs = buildLayoutRefIndex(model.root);
      model = parseAppUIModel(applyAppUIOperations(model, [{
        type: "move_layout_node", nodeRef: refs.byNode.get(nav)!,
        newParentRef: refs.byNode.get(model.root)!, index,
      }]));
      if (model.root.type !== "row") throw new Error("Platform must retain its Row");
      expect(model.root.responsive).toMatchObject({ type: "drawer", drawerIndex: index, primaryIndex: 1 - index });
      expect(model.root.sizes).toEqual(index === 0 ? ["280px", "minmax(0, 1fr)"] : ["minmax(0, 1fr)", "280px"]);
      expect(collectAppUIPluginLocations(model).map(({ plugin }) => plugin.id).sort()).toEqual(identities);
    }
  });

  it("keeps drawer indices distinct and preserves legacy trailing policy validation", () => {
    const row = { type: "row", children: [{ type: "slot", plugins: [] }, { type: "slot", plugins: [] }] };
    for (const drawerIndex of [0, 1]) {
      expect(() => parseAppUIModel({ root: { ...row, responsive: { type: "drawer", primaryIndex: 1 - drawerIndex, drawerIndex, minPrimaryWidth: 320 } } })).not.toThrow();
    }
    expect(() => parseAppUIModel({ root: { ...row, responsive: { type: "drawer", primaryIndex: 0, drawerIndex: 0, minPrimaryWidth: 320 } } })).toThrow();
    expect(() => parseAppUIModel({ root: { ...row, responsive: { type: "trailing-drawer", primaryIndex: 1, drawerIndex: 0, minPrimaryWidth: 320 } } })).toThrow();
  });

  it("ships no template CSS that reverses navigation placement", async () => {
    const css = await readFile(path.join(repo, "packages/plugins/resources/registry/items/foundation/core-adapters/files/agent-ui/conversation/styles.css"), "utf8");
    expect(css).not.toMatch(/row-reverse|inset-inline-(?:start|end)|translate:/);
  });
});
