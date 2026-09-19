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
  collectPluginProjectFacts,
  generatePluginRegistryFromFacts,
  PLUGIN_REGISTRY_ENTRY_PATH,
  PLUGIN_REGISTRY_ENTRY_SOURCE,
} from "./registry-generator";
import {
  agentUISourceSummary,
  inspectAgentUISources,
} from "./source-registry";
import { APP_UI_MUTATION_ADMISSION_GUARANTEES } from "./app-ui-transaction";
import { buildCreatorActionCatalog } from "./creator-action-catalog";
import type {
  CompactLayoutNode,
  InspectedSlot,
  UICompositionInspection,
  UIProjectControlConfig,
  UIProjectInspection,
} from "./types";

const COMPOSITION_OBSERVATION_COVERAGE = [
  "composition.model",
  "composition.layout",
  "composition.slots",
  "composition.instances",
  "capability.inventory",
  "capability.composition-summary",
  "creator.actions",
] as const;

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
  const composition = await inspectUICompositionData(projectRoot, config);
  const projectConfig = await readAgentUIProjectConfig(
    projectRoot,
    config.agentUI.metadataRoot,
  );
  const generatedSource = await readOptional(
    path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH),
  );
  const entrySource = await readOptional(
    path.join(projectRoot, PLUGIN_REGISTRY_ENTRY_PATH),
  );
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
    appUIModel: composition.appUIModel,
    plugins: composition.pluginInstances,
    capabilityCatalog: {
      revision: composition.capabilityCatalogRevision,
      pluginIds: composition.capabilityCatalogPluginIds,
      generatedFileFresh:
        composition.issues.length === 0 &&
        generatedSource === composition.capabilityCatalogSource &&
        entrySource === PLUGIN_REGISTRY_ENTRY_SOURCE,
    },
    activeComposition: composition.activeComposition,
    issues: composition.issues,
    pluginAssets: composition.pluginAssets,
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

interface UICompositionInspectionInternal extends UICompositionInspection {
  capabilityCatalogSource: string;
  capabilityCatalogPluginIds: string[];
  issues: UIProjectInspection["issues"];
  pluginAssets: UIProjectInspection["pluginAssets"];
}

async function inspectUICompositionData(
  projectRoot: string,
  config: UIProjectControlConfig = uiProjectControlConfig,
): Promise<UICompositionInspectionInternal> {
  const appUIModelSource = await readFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    "utf8",
  );
  const model = parseAppUIModelJson(appUIModelSource);
  const appUIModelHash = createHash("sha256").update(appUIModelSource).digest("hex");
  const projectFacts = await collectPluginProjectFacts(projectRoot, config);
  const generation = generatePluginRegistryFromFacts(model, projectFacts);
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
        ...(definition.accepts === undefined
          ? {}
          : { accepts: structuredClone(definition.accepts) }),
        owner: {
          kind: "plugin",
          instanceId: location.plugin.id,
          pluginId: location.plugin.pluginId,
        },
        plugins: structuredClone(location.plugin.slots?.[slot] ?? []),
      });
    }
  }
  const pluginInstances = collectAppUIPluginLocations(model)
    .sort((left, right) => left.plugin.id.localeCompare(right.plugin.id))
    .map(({ plugin, target, index }) => ({
      ...structuredClone(plugin),
      target: target.type === "layout_slot"
        ? { type: "layout_slot" as const, slotRef: refIndex.byPath.get(target.slotPath)! }
        : target,
      index,
    }));
  const selectedPluginIds = generation.activeComposition.selectedPluginIds;
  const pluginAssets = generation.assets.map(({ manifest: _manifest, ...asset }) => ({
    ...asset,
    selected: selectedPluginIds.includes(asset.pluginId),
  }));
  const serviceDeclarationsByPluginId = new Map(
    generation.serviceDependencies.plugins.map((declaration) => [
      declaration.pluginId,
      declaration,
    ]),
  );
  const serviceStatusByName = new Map(
    generation.serviceDependencies.services.map((service) => [
      service.name,
      service.status,
    ]),
  );
  const creatorActionCatalog = await buildCreatorActionCatalog({
    model,
    generation,
    projectFacts,
    appUIModelHash,
  });

  return {
    schemaVersion: 3,
    view: "composition",
    observationCoverage: [...COMPOSITION_OBSERVATION_COVERAGE],
    appUIModel: {
      hash: appUIModelHash,
      layout,
      slots,
    },
    pluginInstances,
    capabilitySummaries: pluginAssets.map((asset) => ({
      pluginId: asset.pluginId,
      name: asset.name,
      description: asset.description,
      capabilities: [...asset.capabilities],
      selected: asset.selected,
      currentInstances: pluginInstances
        .filter((instance) => instance.pluginId === asset.pluginId)
        .map((instance) => ({
          instanceId: instance.id,
          enabled: instance.enabled,
          target: structuredClone(instance.target),
          index: instance.index,
        })),
      selectionOwner: "composition",
      ...(asset.authoring === undefined
        ? {}
        : { authoring: structuredClone(asset.authoring) }),
      requiredServices: (() => {
        const declaration = serviceDeclarationsByPluginId.get(asset.pluginId);
        const names = declaration?.inject ?? [];
        const missing = names.filter(
          (name) => serviceStatusByName.get(name) !== "available",
        );
        return {
          names: [...names],
          status: declaration === undefined
            ? "unknown" as const
            : names.length === 0
              ? "not-required" as const
              : missing.length === 0
                ? "resolved" as const
                : "unresolved" as const,
          missing,
        };
      })(),
      optionalServices: (() => {
        const names =
          serviceDeclarationsByPluginId.get(asset.pluginId)?.optionalInject ?? [];
        return {
          names: [...names],
          available: names.filter(
            (name) => serviceStatusByName.get(name) === "available",
          ),
        };
      })(),
      ...(asset.layoutWidth === undefined ? {} : { layoutWidth: asset.layoutWidth }),
      ...(asset.childSlots === undefined ? {} : { childSlots: structuredClone(asset.childSlots) }),
    })),
    activeComposition: {
      selectedPluginIds,
      resolvedPluginIds: generation.activeComposition.resolvedPluginIds,
      headlessPluginIds: generation.activeComposition.headlessPluginIds,
    },
    capabilityCatalogRevision: generation.capabilityCatalog.revision,
    creatorActions: {
      revision: creatorActionCatalog.revision,
      candidates: creatorActionCatalog.candidates,
    },
    layoutConstraints: {
      refs: "snapshot-scoped",
      pluginTargets: ["application", "layout_slot", "plugin_slot"],
      sizedContainerInsertion: {
        rule: "size-required",
        operations: ["insert_layout_node", "move_layout_node", "insert_layout_relative"],
      },
      relativeWrapperSizing: {
        rule: "size-and-anchorSize-together",
        operation: "insert_layout_relative",
      },
      operationApplication: "sequential-atomic",
    },
    hostGuarantees: {
      mutation: "mutate_app_ui_model",
      admission: "deterministic-atomic",
      checks: APP_UI_MUTATION_ADMISSION_GUARANTEES,
      commit: "all-or-nothing",
      postCommitVerificationRequired: true,
      guidance: "Use this snapshot to form the semantic delta. Do not preflight facts covered by these admission checks with manifest, source, CSS, Service, or generated-file reads. Admission success commits static AppUIModel state only; post-commit verification is still required against the current revision.",
    },
    capabilityCatalogSource: generation.capabilityCatalog.source,
    capabilityCatalogPluginIds: generation.capabilityCatalog.pluginIds,
    issues: generation.errors,
    pluginAssets,
  };
}

export async function inspectUIComposition(
  projectRoot: string,
  config: UIProjectControlConfig = uiProjectControlConfig,
): Promise<UICompositionInspection> {
  const {
    capabilityCatalogSource: _capabilityCatalogSource,
    capabilityCatalogPluginIds: _capabilityCatalogPluginIds,
    issues: _issues,
    pluginAssets: _pluginAssets,
    ...snapshot
  } = await inspectUICompositionData(projectRoot, config);
  return snapshot;
}
