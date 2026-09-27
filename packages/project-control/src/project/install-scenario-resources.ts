import { officialResourceRegistry, type OfficialAgentUIResource } from "@agent-ui/source-registry";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildLayoutRefIndex, collectAppUIPluginLocations, parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import { generateConversationIntegrationRegistry } from "../generate-conversation-integration-registry";
import { verifyUIProject } from "../verify-ui";
import { inspectAgentUISources } from "./source-registry/index";
import { recoverPendingAgentUISourceProjectMutation } from "./source-registry/project-mutation";
import { mutateAppUIModel } from "./app-ui-transaction";
import { resourcePaths } from "./optional-resource-paths";
import { installOptionalAgentUIResource } from "./install-optional-agent-ui-resource";
import type { AppUIOperation } from "./app-ui-operations";

export async function inspectScenarioResources(projectRoot: string) {
  const { config } = await resourcePaths(projectRoot);
  await recoverPendingAgentUISourceProjectMutation(projectRoot, config);
  const inspection = await inspectAgentUISources(projectRoot, config);
  let integrationRegistryReady = false;
  try {
    const { destination, source } = await generateConversationIntegrationRegistry(projectRoot);
    integrationRegistryReady = await readFile(destination, "utf8") === source;
  } catch { /* Missing/stale derived integration files never imply readiness. */ }
  return { ...inspection, integrationRegistryReady };
}

/** @deprecated Internal compatibility adapter; new hosts use installOfficialAgentUIResource. */
export async function installMockResource(projectRoot: string, sourceItemId: string): Promise<void> {
  await installOptionalAgentUIResource(projectRoot, sourceItemId);
  const resource = officialResourceRegistry.resources.find(resource =>
    resource.implementation.type === "source-plugin" && resource.implementation.sourceItemId === sourceItemId);
  if (resource?.implementation.type === "source-plugin") await activateOfficialResourcePlugin(projectRoot, resource.implementation);
}

/** Resource-owned composition through the existing AppUIModel transaction. */
export async function activateOfficialResourcePlugin(projectRoot: string, implementation: Extract<OfficialAgentUIResource["implementation"], { type: "source-plugin" }>): Promise<void> {
  const { pluginId } = implementation;
  const { paths } = await resourcePaths(projectRoot);
  const source = await readFile(paths.appUIModelPath, "utf8");
  const model = parseAppUIModelJson(source);
  const locations = collectAppUIPluginLocations(model);
  const matches = locations.filter(entry => entry.plugin.pluginId === pluginId);
  if (matches.length > 1) throw new Error("存在多个 Demo 实例，请先处理重复实例。");
  const operations: AppUIOperation[] = [];
  const match = matches[0];
  const ids = new Set(locations.map(entry => entry.plugin.id));
  let instanceId = `${pluginId}-main`;
  for (let suffix = 2; ids.has(instanceId); suffix++) instanceId = `${pluginId}-main-${suffix}`;
  const insertLayout = (plugins: typeof model.applicationPlugins, localRef?: string) => {
    const refs = buildLayoutRefIndex(model.root);
    const surface = locations.find(entry => entry.plugin.pluginId === "conversation-surface" && entry.target.type === "layout_slot");
    const anchorRef = surface?.target.type === "layout_slot" ? refs.byNode.get(surface.target.slotNode)! : "l0";
    operations.push({ type: "insert_layout_relative", anchorRef, direction: "right",
      node: { type: "panel", child: { type: "slot", plugins: plugins ?? [], ...(localRef === undefined ? {} : { localRef }) } },
      size: implementation.layoutSize ?? "320px", anchorSize: "minmax(0, 1fr)" });
  };
  if (implementation.slot !== undefined) {
    const parents = locations.filter(entry => entry.plugin.pluginId === "conversation-surface");
    if (parents.length !== 1) throw new Error("Cannot uniquely resolve conversation resource placement.");
    const parent = parents[0]!;
    const target = { type: "plugin_slot" as const, parentInstanceId: parent.plugin.id, slot: implementation.slot };
    if (match && (match.target.type !== "plugin_slot" || match.target.parentInstanceId !== target.parentInstanceId || match.target.slot !== target.slot)) {
      operations.push({ type: "move_plugin", instanceId: match.plugin.id, target });
    }
    if (!match) operations.push({ type: "insert_plugin", target, plugin: { id: instanceId, pluginId, enabled: true } });
    let ancestor: typeof parent | undefined = parent;
    while (ancestor) {
      if (!ancestor.plugin.enabled) operations.push({ type: "set_plugin_enabled", instanceId: ancestor.plugin.id, enabled: true });
      const id: string | undefined = ancestor.target.type === "plugin_slot" ? ancestor.target.parentInstanceId : undefined;
      ancestor = id === undefined ? undefined : locations.find(entry => entry.plugin.id === id);
    }
  } else if (match && match.target.type !== "layout_slot") {
    insertLayout([], "$resource-slot");
    operations.push({ type: "move_plugin", instanceId: match.plugin.id, target: { type: "layout_slot", slotRef: "$resource-slot" } });
  }
  if (matches.length) {
    let location = matches[0];
    while (location) {
      if (!location.plugin.enabled) operations.push({ type: "set_plugin_enabled", instanceId: location.plugin.id, enabled: true });
      const parentId: string | undefined = location.target.type === "plugin_slot" ? location.target.parentInstanceId : undefined;
      location = implementation.slot !== undefined || match?.target.type !== "layout_slot" || parentId === undefined ? undefined : locations.find(entry => entry.plugin.id === parentId);
    }
  } else if (implementation.slot === undefined) {
    // A visible layout sibling, never a hidden application plugin.
    insertLayout([{ id: instanceId, pluginId, enabled: true }]);
  }
  if (operations.length) await mutateAppUIModel(projectRoot, { appUIModelHash: createHash("sha256").update(source).digest("hex"), operations });
  const verification = await verifyUIProject(projectRoot);
  if (verification.status !== "passed") throw new Error("Demo 资源已引入，但项目组合验证未通过。");
}

export { installOptionalAgentUIResource } from "./install-optional-agent-ui-resource";

/** @deprecated Internal compatibility adapter; use installOfficialAgentUIResource. */
export const installScenarioResources = installMockResource;
