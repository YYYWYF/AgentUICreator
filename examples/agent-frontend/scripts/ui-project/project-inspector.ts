import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildLayoutRefIndex,
  collectAppUIPluginLocations,
  parseAppUIModelJson,
  walkAppUILayout,
  type AppUILayoutNode,
} from "../../framework/contracts/app-ui-model";
import { pathExists } from "./plugin-assets";
import { uiProjectControlConfig } from "./project-config";
import { readAgentUIProjectConfig } from "./project-mode";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
  PLUGIN_REGISTRY_ENTRY_PATH,
  PLUGIN_REGISTRY_ENTRY_SOURCE,
} from "./registry-generator";
import {
  agentUISourceSummary,
  inspectAgentUISources,
} from "./source-registry";
import type {
  CompactLayoutNode,
  InspectedSlot,
  UIProjectControlConfig,
  UIProjectInspection,
} from "./types";

function compactLayout(
  node: AppUILayoutNode,
  nodePath: string,
  nodeRef: string,
  refIndex: ReturnType<typeof buildLayoutRefIndex>,
): CompactLayoutNode {
  if (node.type === "slot") {
    return {
      nodeRef,
      type: node.type,
      plugins: structuredClone(node.plugins),
    };
  }
  if (node.type === "panel") {
    return {
      nodeRef,
      type: node.type,
      ...(node.width === undefined ? {} : { width: node.width }),
      ...(node.height === undefined ? {} : { height: node.height }),
      ...(node.minWidth === undefined ? {} : { minWidth: node.minWidth }),
      ...(node.maxWidth === undefined ? {} : { maxWidth: node.maxWidth }),
      ...(node.resizable === undefined ? {} : { resizable: node.resizable }),
      child: compactLayout(node.child, `${nodePath}.child`, refIndex.byPath.get(`${nodePath}.child`)!, refIndex),
    };
  }

  return {
    nodeRef,
    type: node.type,
    ...(node.type !== "row" && node.type !== "column"
      ? {}
      : node.sizes === undefined
        ? {}
        : { sizes: [...node.sizes] }),
    ...(node.type !== "row" && node.type !== "column"
      ? {}
      : node.gap === undefined
        ? {}
        : { gap: node.gap }),
    ...(node.type !== "stack" || node.activeIndex === undefined
      ? {}
      : { activeIndex: node.activeIndex }),
    children: node.children.map((child, index) =>
      compactLayout(child, `${nodePath}.children[${index}]`, refIndex.byPath.get(`${nodePath}.children[${index}]`)!, refIndex),
    ),
  };
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function dependencyVersions(source: unknown): Record<string, string> {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    return {};
  }
  const packageJson = source as Record<string, unknown>;
  const versions: Record<string, string> = {};
  for (const field of ["dependencies", "devDependencies"]) {
    const value = packageJson[field];
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      continue;
    }
    for (const [name, version] of Object.entries(value)) {
      if (typeof version === "string") {
        versions[name] = version;
      }
    }
  }
  return versions;
}

export async function inspectUIProject(
  projectRoot: string,
  config: UIProjectControlConfig = uiProjectControlConfig,
): Promise<UIProjectInspection> {
  const projectConfig = await readAgentUIProjectConfig(
    projectRoot,
    config.agentUI.metadataRoot,
  );
  const appUIModelSource = await readFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    "utf8",
  );
  const model = parseAppUIModelJson(appUIModelSource);
  const generation = await generatePluginRegistry(projectRoot, model, config);
  const generatedSource = await readOptional(
    path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH),
  );
  const entrySource = await readOptional(
    path.join(projectRoot, PLUGIN_REGISTRY_ENTRY_PATH),
  );
  const refIndex = buildLayoutRefIndex(model.root);
  const layout = compactLayout(model.root, "root", refIndex.byPath.get("root")!, refIndex);
  const slots: InspectedSlot[] = [];
  for (const entry of walkAppUILayout(model.root)) {
    if (entry.node.type === "slot") {
      slots.push({
        target: { type: "layout_slot", slotRef: refIndex.byPath.get(entry.path)! },
        nodeRef: refIndex.byPath.get(entry.path)!,
        plugins: structuredClone(entry.node.plugins),
      });
    }
  }
  const assetsByPluginId = new Map(generation.assets.map((asset) => [asset.pluginId, asset]));
  for (const location of collectAppUIPluginLocations(model)) {
    const definitions = assetsByPluginId.get(location.plugin.pluginId)?.childSlots ?? {};
    for (const [slot, definition] of Object.entries(definitions)) {
      slots.push({
        target: { type: "plugin_slot", parentInstanceId: location.plugin.id, slot },
        description: definition.description,
        cardinality: definition.cardinality,
        optional: definition.optional === true,
        owner: {
          kind: "plugin",
          instanceId: location.plugin.id,
          pluginId: location.plugin.pluginId,
        },
        plugins: structuredClone(location.plugin.slots?.[slot] ?? []),
      });
    }
  }
  const packageJson = JSON.parse(
    await readFile(path.join(projectRoot, "package.json"), "utf8"),
  ) as unknown;
  const versions = dependencyVersions(packageJson);
  const agentUI = agentUISourceSummary(
    await inspectAgentUISources(projectRoot, config),
  );

  return {
    schemaVersion: 3,
    mode: projectConfig.config.mode,
    modeResolution: {
      legacy: projectConfig.legacy,
      configPath: projectConfig.path,
    },
    appUIModel: {
      hash: createHash("sha256").update(appUIModelSource).digest("hex"),
      layout,
      slots,
    },
    plugins: collectAppUIPluginLocations(model)
      .sort((left, right) => left.plugin.id.localeCompare(right.plugin.id))
      .map(({ plugin, target, index }) => ({
        ...structuredClone(plugin),
        target: target.type === "layout_slot"
          ? { type: "layout_slot" as const, slotRef: refIndex.byPath.get(target.slotPath)! }
          : target,
        index,
      })),
    registry: {
      capabilityCatalogRevision: generation.capabilityCatalogRevision,
      capabilityPluginIds: generation.capabilityPluginIds,
      selectedPluginIds: generation.selectedPluginIds,
      registeredPluginIds: generation.registeredPluginIds,
      generatedFileFresh:
        generation.errors.length === 0 &&
        generatedSource === generation.source &&
        entrySource === PLUGIN_REGISTRY_ENTRY_SOURCE,
      issues: generation.errors,
    },
    pluginAssets: generation.assets.map(({ manifest: _manifest, ...asset }) => ({
      ...asset,
      selected: generation.selectedPluginIds.includes(asset.pluginId),
    })),
    catalogs: await Promise.all(
      config.catalogs.map(async (catalogPath) => ({
        path: catalogPath,
        exists: await pathExists(path.join(projectRoot, catalogPath)),
      })),
    ),
    uiStack: config.uiPackages.flatMap((packageName) => {
      const version = versions[packageName];
      return version === undefined ? [] : [{ packageName, version }];
    }),
    agentUI,
  };
}
