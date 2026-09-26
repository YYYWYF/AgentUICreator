import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildLayoutRefIndex, collectAppUIPluginLocations, parseAppUIModelJson } from "../../framework/contracts/app-ui-model";
import { verifyUIProject } from "../verify-ui";
import { inspectAgentUISources } from "./source-registry";
import { mutateAppUIModel } from "./app-ui-transaction";
import { resourcePaths } from "./optional-resource-paths";
import { installOptionalAgentUIResource } from "./install-optional-agent-ui-resource";
import type { AppUIOperation } from "./app-ui-operations";

const bundles = {
  "demo/frontend-tool-dialog": "frontend-tool-dialog-demo",
  "demo/frontend-tool-form": "frontend-tool-form-demo",
} as const;

export async function inspectScenarioResources(projectRoot: string) {
  const { config } = await resourcePaths(projectRoot);
  return inspectAgentUISources(projectRoot, config);
}

/** Cross-layer resource installation through the existing source/composition transactions. */
export async function installScenarioResources(projectRoot: string, sourceItemId: string): Promise<void> {
  if (!Object.hasOwn(bundles, sourceItemId)) throw new Error("Unsupported scenario resource bundle");
  const pluginId = bundles[sourceItemId as keyof typeof bundles];
  const { paths } = await resourcePaths(projectRoot);
  await installOptionalAgentUIResource(projectRoot, sourceItemId);
  const source = await readFile(paths.appUIModelPath, "utf8");
  const model = parseAppUIModelJson(source);
  const locations = collectAppUIPluginLocations(model);
  const matches = locations.filter(entry => entry.plugin.pluginId === pluginId);
  if (matches.length > 1) throw new Error("存在多个 Demo 实例，请先处理重复实例。");
  const operations: AppUIOperation[] = [];
  if (matches.length) {
    let location = matches[0];
    while (location) {
      if (!location.plugin.enabled) operations.push({ type: "set_plugin_enabled", instanceId: location.plugin.id, enabled: true });
      const parentId: string | undefined = location.target.type === "plugin_slot" ? location.target.parentInstanceId : undefined;
      location = parentId === undefined ? undefined : locations.find(entry => entry.plugin.id === parentId);
    }
  } else {
    const ids = new Set(locations.map(entry => entry.plugin.id));
    let id = `${pluginId}-main`;
    for (let suffix = 2; ids.has(id); suffix++) id = `${pluginId}-main-${suffix}`;
    const plugin = { id, pluginId, enabled: true };
    // A visible layout sibling, never a hidden application plugin.
    const refs = buildLayoutRefIndex(model.root);
    const surface = locations.find(entry => entry.plugin.pluginId === "conversation-surface" && entry.target.type === "layout_slot");
    const anchorRef = surface?.target.type === "layout_slot" ? refs.byNode.get(surface.target.slotNode)! : "l0";
    operations.push({ type: "insert_layout_relative", anchorRef, direction: "right",
      node: { type: "panel", child: { type: "slot", plugins: [plugin] } },
      size: sourceItemId === "demo/frontend-tool-form" ? "320px" : "0px", anchorSize: "minmax(0, 1fr)" });
  }
  if (operations.length) await mutateAppUIModel(projectRoot, { appUIModelHash: createHash("sha256").update(source).digest("hex"), operations });
  const verification = await verifyUIProject(projectRoot);
  if (verification.status !== "passed") throw new Error("Demo 资源已引入，但项目组合验证未通过。");
}

export { installOptionalAgentUIResource } from "./install-optional-agent-ui-resource";
