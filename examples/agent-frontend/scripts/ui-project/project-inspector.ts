import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  parseAppUIModelJson,
  type LayoutNode,
} from "../../framework/contracts/app-ui-model";
import { pathExists } from "./plugin-assets";
import { uiProjectControlConfig } from "./project-config";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
  PLUGIN_REGISTRY_ENTRY_PATH,
  PLUGIN_REGISTRY_ENTRY_SOURCE,
} from "./registry-generator";
import type {
  CompactLayoutNode,
  InspectedSlot,
  UIProjectControlConfig,
  UIProjectInspection,
} from "./types";

function compactLayout(
  node: LayoutNode,
  nodePath: string,
): CompactLayoutNode {
  if (node.type === "slot") {
    return {
      id: node.id,
      type: node.type,
      slotId: node.slotId,
    };
  }
  if (node.type === "panel") {
    return {
      id: node.id,
      type: node.type,
      ...(node.width === undefined ? {} : { width: node.width }),
      ...(node.height === undefined ? {} : { height: node.height }),
      ...(node.minWidth === undefined ? {} : { minWidth: node.minWidth }),
      ...(node.maxWidth === undefined ? {} : { maxWidth: node.maxWidth }),
      ...(node.resizable === undefined ? {} : { resizable: node.resizable }),
      child: compactLayout(node.child, `${nodePath}.child`),
    };
  }

  return {
    id: node.id,
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
    ...(node.type !== "stack" || node.active === undefined
      ? {}
      : { active: node.active }),
    children: node.children.map((child, index) =>
      compactLayout(child, `${nodePath}.children[${index}]`),
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
  const layout = compactLayout(model.root, "root");
  const layoutLocations = new Map<string, { nodeId: string; nodePath: string }>();
  const collectLayoutLocations = (node: LayoutNode, nodePath: string): void => {
    if (node.type === "slot") {
      layoutLocations.set(node.slotId, { nodeId: node.id, nodePath });
      return;
    }
    if (node.type === "panel") {
      collectLayoutLocations(node.child, `${nodePath}.child`);
      return;
    }
    node.children.forEach((child, index) =>
      collectLayoutLocations(child, `${nodePath}.children[${index}]`),
    );
  };
  collectLayoutLocations(model.root, "root");
  // This is a static configuration view, not a snapshot of active contributions.
  const slots: InspectedSlot[] = [...layoutLocations]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([slotId, location]) => ({
      slotId,
      ...location,
      mounts: Object.values(model.pluginInstances)
        .filter((instance) => instance.mount?.slotId === slotId)
        .sort((left, right) =>
          (left.mount?.order ?? 0) - (right.mount?.order ?? 0) ||
          (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
        )
        .map((instance) => ({
          instanceId: instance.id,
          pluginId: instance.pluginId,
          enabled: instance.enabled,
          ...(instance.mount?.order === undefined ? {} : { order: instance.mount.order }),
        })),
    }));
  const packageJson = JSON.parse(
    await readFile(path.join(projectRoot, "package.json"), "utf8"),
  ) as unknown;
  const versions = dependencyVersions(packageJson);

  return {
    schemaVersion: 2,
    appUIModel: {
      hash: createHash("sha256").update(appUIModelSource).digest("hex"),
      version: model.version,
      layout,
      slots,
    },
    pluginInstances: Object.values(model.pluginInstances)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((instance) => ({
        ...instance,
        ...(instance.mount !== undefined
          ? { mountedSlotId: instance.mount.slotId }
          : {}),
      })),
    registry: {
      selectedPluginIds: generation.selectedPluginIds,
      registeredPluginIds: generation.registeredPluginIds,
      generatedFileFresh:
        generation.errors.length === 0 &&
        generatedSource === generation.source &&
        entrySource === PLUGIN_REGISTRY_ENTRY_SOURCE,
      issues: generation.errors,
    },
    pluginAssets: generation.assets.map((asset) => ({
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
  };
}
