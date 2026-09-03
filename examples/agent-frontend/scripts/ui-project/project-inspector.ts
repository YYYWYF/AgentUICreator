import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  parseAppUIModelJson,
  type LayoutNode,
} from "../../framework/contracts/app-ui-model";
import {
  assertUIPluginSlotContract,
  parseUIPluginSlotDefinitions,
  type UIPluginDefinition,
} from "../../framework/contracts/ui-plugin";
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
  const slotDeclarations = new Map<
    string,
    {
      sourcePath: string;
      definition?: UIPluginDefinition | undefined;
      invalid?: boolean | undefined;
    }
  >();
  for (const asset of generation.assets.filter((candidate) =>
    generation.selectedPluginIds.includes(candidate.pluginId),
  )) {
    const sourcePath = `plugins/${asset.directory}/slots.json`;
    const source = await readOptional(path.join(projectRoot, sourcePath));
    if (source === undefined) continue;
    try {
      const slots = parseUIPluginSlotDefinitions(JSON.parse(source));
      slotDeclarations.set(asset.pluginId, {
        sourcePath,
        definition: {
          manifest: {
            id: asset.pluginId,
            name: asset.pluginId,
            description: "Static Slot contract inspection",
            version: "0",
          },
          slots,
          Component: () => null,
        },
      });
    } catch {
      slotDeclarations.set(asset.pluginId, { sourcePath, invalid: true });
    }
  }
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
  const mountedSlots = new Map<string, string>();
  for (const slot of Object.values(model.slots)) {
    for (const occupant of slot.occupants) {
      mountedSlots.set(occupant.instanceId, slot.id);
    }
  }
  const childSlots = new Map<string, string[]>();
  Object.values(model.slots).forEach((slot) => {
    if (slot.owner.type !== "plugin-instance") return;
    const children = childSlots.get(slot.owner.instanceId) ?? [];
    children.push(slot.id);
    childSlots.set(slot.owner.instanceId, children);
  });
  const slots: InspectedSlot[] = Object.values(model.slots)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((slot) => {
      const layoutLocation = layoutLocations.get(slot.id);
      const parentSlotId = slot.owner.type === "plugin-instance"
        ? mountedSlots.get(slot.owner.instanceId)
        : undefined;
      const descendants = slot.occupants.flatMap(
        (occupant) => childSlots.get(occupant.instanceId) ?? [],
      );
      let declarationStatus: InspectedSlot["declarationStatus"] = "layout";
      let declarationSource: string | undefined;
      if (slot.owner.type === "plugin-instance") {
        const pluginId = model.pluginInstances[slot.owner.instanceId]?.pluginId;
        const declaration = pluginId === undefined
          ? undefined
          : slotDeclarations.get(pluginId);
        declarationSource = declaration?.sourcePath;
        if (declaration?.invalid === true) {
          declarationStatus = "invalid";
        } else if (declaration?.definition === undefined) {
          declarationStatus = "missing";
        } else {
          try {
            assertUIPluginSlotContract(
              slot,
              slot.owner.outlet,
              declaration.definition,
            );
            declarationStatus = "verified";
          } catch {
            declarationStatus =
              declaration.definition.slots?.[slot.owner.outlet] === undefined
                ? "missing"
                : "mismatch";
          }
        }
      }
      const replaceRisk = descendants.length > 0 && slot.kind === "single"
          ? "removes-descendant-slots" as const
          : slot.kind === "chain" && slot.occupants.length > 0
            ? "changes-chain-resolution" as const
            : slot.kind === "single" && slot.occupants.length > 0
            ? "replaces-occupant" as const
            : slot.occupants.length === 0 && slot.fallback === "owner"
              ? "replaces-owner-fallback" as const
              : "none" as const;
      return {
        slotId: slot.id,
        kind: slot.kind,
        scope: slot.scope,
        description: slot.description,
        owner: structuredClone(slot.owner),
        declarer: slot.owner.type === "layout"
          ? { type: "layout" as const, nodeId: slot.owner.nodeId }
          : {
              type: "plugin" as const,
              pluginId:
                model.pluginInstances[slot.owner.instanceId]?.pluginId ?? "unknown",
              instanceId: slot.owner.instanceId,
              outlet: slot.owner.outlet,
            },
        declarationStatus,
        ...(declarationSource === undefined ? {} : { declarationSource }),
        ownerProps: structuredClone(slot.ownerProps ?? []),
        fallback: slot.fallback ?? "none",
        occupants: slot.occupants.map((occupant) => {
          const instance = model.pluginInstances[occupant.instanceId]!;
          return {
            ...structuredClone(occupant),
            pluginId: instance.pluginId,
            enabled: instance.enabled,
          };
        }),
        ...(parentSlotId === undefined ? {} : { parentSlotId }),
        childSlotIds: descendants.sort(),
        ...(layoutLocation === undefined ? {} : layoutLocation),
        replaceRisk,
      };
    });
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
        ...(mountedSlots.has(instance.id)
          ? { mountedSlotId: mountedSlots.get(instance.id) }
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
