import { inspectPluginSharedTypes } from "./project/plugin-shared-types";
import { inspectPluginApplication } from "./project/plugin-application-inspector";
import { resolveCompatibilityConsumer } from "./project/compatibility-binding";
import { planPluginSourceTakeover, takeoverPluginSource, recoverPluginSourceTakeover, planPluginSourceInputSchema, takeoverPluginSourceInputSchema } from "./project/takeover-plugin-source";
import { assertRuntimeBuildCurrent } from "./runtime-integrity.mjs";
declare const __OPERATOR_BUILD_ID__: string;
import { createCustomPlugin, createCustomPluginInputSchema } from "./project/create-custom-plugin";
import { migrateOfficialPackagePlugin } from "./project/migrate-official-package-plugin";
import { officialPackagePlugin, loadAgentUISourceRegistry } from "./source-catalog/index.js";
import { integrationOptionsSchema, integrationRecipeSchema, planIntegrationRecipe, applyIntegrationRecipe, prepareIntegrationRecipeAsset, verifyIntegrationRecipe } from "./project/integration-recipe";
import { appUIRepairInputSchema, inspectAppUIModelSource, repairAppUIModel } from "./project/app-ui-recovery";
import { acquireOperatorLock } from "./project/operator-lock";
import { pluginPurgeInputSchema, purgeUIPlugin } from "./project/plugin-purge";
import { recoverPendingPluginPurge } from "./project/plugin-purge-transaction";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";
import { validateOperatorResult } from "./result-contract.mjs";
import { verifyUIProject } from "./verify-ui";

import { parseAppUIModelJson } from "./framework/contracts/app-ui-model";
import {
  appUITransactionInputSchema,
  mutateAppUIModel,
  recoverPendingAppUITransaction,
} from "./project/app-ui-transaction";
import { inspectUIComposition, inspectUIProject } from "./project/project-inspector";
import { collectPluginProjectFacts } from "./project/registry-generator";
import { inspectPluginSourceReferences } from "./project/plugin-source-references";
import { collectPluginAssets } from "./project/plugin-assets";
import { preflightCreatorPluginPlacement } from "./project/creator-placement-preflight";
import { creatorCancelMarkerSchemaPattern } from "./project/creator-cancel-marker";
import { resolveAgentUIProjectPaths, operatorConfigForPaths } from "./project/agent-ui-project-paths";
import { readAgentUIProjectConfig } from "./project/project-mode";
import { writeGeneratedPluginRegistry } from "./generate-plugin-registry";
import { inspectUIServiceDependencies } from "./project/service-dependency-inspector";
import {
  inspectAgentUISources,
} from "./project/source-registry/index";
import { applyAgentUISourceProjectMutation, removeAgentUISourceProjectMutation, recoverPendingAgentUISourceProjectMutation } from "./project/source-registry/project-mutation";
import {
  verifyRuntimeComposition,
  verifyRuntimeCompositionInputSchema,
} from "./project/runtime-composition-verifier";

export const MAX_UI_OPERATOR_INPUT_BYTES = 64_000;
export const MAX_UI_OPERATOR_OUTPUT_BYTES = 512_000;
export const MAX_APP_UI_MODEL_CHARACTERS = 120_000;
export const MAX_PLUGIN_SOURCE_CHARACTERS = 24_000;
export const MAX_PLUGIN_FILES = 100;

const defaultProjectRoot = process.cwd();

const emptyInputSchema = z.strictObject({});
const inspectUIProjectInputSchema = z.union([
  emptyInputSchema,
  z.strictObject({ view: z.literal("composition") }),
]);
const appUIModelHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const inspectedLayoutSlotTargetSchema = z.strictObject({
  type: z.literal("layout_slot"),
  slotRef: z.string().regex(/^l[0-9]+$/u),
});
const inspectedPluginSlotTargetSchema = z.strictObject({
  type: z.literal("plugin_slot"),
  parentInstanceId: z.string().min(1).max(200).regex(/\S/u).transform((value) => value.trim()),
  slot: z.string().min(1).max(200).regex(/\S/u).transform((value) => value.trim()),
});
const inspectUISlotsInputSchema = z.union([
  emptyInputSchema,
  z.strictObject({
    appUIModelHash: appUIModelHashSchema,
    target: inspectedLayoutSlotTargetSchema,
  }),
  z.strictObject({
    target: inspectedPluginSlotTargetSchema,
  }),
]);
export const requestSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("plan_plugin_source_takeover"), input: planPluginSourceInputSchema }),
  z.strictObject({ operation: z.literal("takeover_plugin_source"), input: takeoverPluginSourceInputSchema }),
  z.strictObject({ operation: z.literal("create_custom_plugin"), input: createCustomPluginInputSchema }),
  z.strictObject({ operation: z.literal("migrate_official_package_plugin"), input: z.strictObject({ pluginId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/u) }) }),
  z.strictObject({ operation: z.literal("plan_agent_ui_integration"), input: integrationOptionsSchema }),
  z.strictObject({ operation: z.literal("apply_agent_ui_integration"), input: z.strictObject({ recipe: integrationRecipeSchema, cancelMarker: z.string().regex(creatorCancelMarkerSchemaPattern).optional() }) }),
  z.strictObject({ operation: z.literal("prepare_agent_ui_integration_asset"), input: z.strictObject({ recipe: integrationRecipeSchema, cancelMarker: z.string().regex(creatorCancelMarkerSchemaPattern).optional() }) }),
  z.strictObject({ operation: z.literal("verify_agent_ui_integration"), input: z.strictObject({ recipe: integrationRecipeSchema }) }),
  z.strictObject({ operation: z.literal("purge_ui_plugin"), input: pluginPurgeInputSchema }),
  z.strictObject({
    operation: z.literal("inspect_ui_project"),
    input: inspectUIProjectInputSchema,
  }),
  z.strictObject({ operation: z.literal("inspect_app_ui_model_source"), input: emptyInputSchema }),
  z.strictObject({ operation: z.literal("repair_app_ui_model"), input: appUIRepairInputSchema }),
  z.strictObject({
    operation: z.literal("inspect_app_ui_model"),
    input: emptyInputSchema,
  }),
  z.strictObject({
    operation: z.literal("inspect_ui_slots"),
    input: inspectUISlotsInputSchema,
  }),
  z.strictObject({
    operation: z.literal("list_ui_plugins"),
    input: emptyInputSchema,
  }),
  z.strictObject({
    operation: z.literal("inspect_ui_services"),
    input: emptyInputSchema,
  }),
  z.strictObject({
    operation: z.literal("inspect_ui_plugin"),
    input: z.strictObject({ pluginId: z.string().min(1).max(200).regex(/\S/u).transform((value) => value.trim()), sharedModule: z.string().regex(/^@za38\.03\/agent-ui-plugins(?:\/[a-z][a-z0-9-]*)?$/u).optional(), sharedSymbols: z.array(z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]{0,99}(?:\.[A-Za-z_$][A-Za-z0-9_$]{0,99}){0,8}$/u)).min(1).max(8).optional() }),
  }),
  z.strictObject({
    operation: z.literal("preflight_ui_plugin_placement"),
    input: z.strictObject({
      appUIModelHash: appUIModelHashSchema,
      capabilityCatalogRevision: appUIModelHashSchema,
      instanceId: z.string().min(1).max(200).regex(/\S/u).transform((value) => value.trim()),
      manifest: z.record(z.string(), z.unknown()),
    }),
  }),
  z.strictObject({
    operation: z.literal("inspect_ui_plugin_source_references"),
    input: z.strictObject({ pluginId: z.string().min(1).max(200).regex(/\S/u).transform((value) => value.trim()) }),
  }),
  z.strictObject({
    operation: z.literal("verify_runtime_composition"),
    input: verifyRuntimeCompositionInputSchema,
  }),
  z.strictObject({
    operation: z.literal("verify_ui_project"),
    input: emptyInputSchema,
  }),
  z.strictObject({
    operation: z.literal("mutate_app_ui_model"),
    input: appUITransactionInputSchema,
  }),
  z.strictObject({
    operation: z.literal("inspect_agent_ui_sources"),
    input: emptyInputSchema,
  }),
  z.strictObject({
    operation: z.literal("apply_agent_ui_source_item"),
    input: z.strictObject({
      itemId: z.string().min(1).max(200).regex(/\S/u).transform((value) => value.trim()),
      expectedStateHash: z.string().regex(/^[a-f0-9]{64}$/),
      cancelMarker: z.string().regex(creatorCancelMarkerSchemaPattern).optional(),
    }),
  }),
  z.strictObject({
    operation: z.literal("remove_agent_ui_source_items"),
    input: z.strictObject({
      itemIds: z.array(z.string().min(1).max(200).regex(/\S/u).transform((value) => value.trim())).min(1).max(100),
      expectedStateHash: z.string().regex(/^[a-f0-9]{64}$/),
      cancelMarker: z.string().regex(creatorCancelMarkerSchemaPattern).optional(),
    }),
  }),
  z.strictObject({
    operation: z.literal("synchronize_plugin_registry"),
    input: z.strictObject({ expectedSourceHash: appUIModelHashSchema,
      cancelMarker: z.string().regex(creatorCancelMarkerSchemaPattern).optional() }),
  }),
]);

type UIOperatorRequest = z.infer<typeof requestSchema>;

export interface UIOperatorSuccess {

  ok: true;
  result: unknown;
}

export interface UIOperatorFailure {

  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type UIOperatorResponse =
  | UIOperatorSuccess
  | UIOperatorFailure;

class UIOperatorError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "UIOperatorError";
    this.code = code;
    this.details = details;
  }
}

function boundedText(source: string, limit: number) {
  return {
    content: source.slice(0, limit),
    truncated: source.length > limit,
    characters: source.length,
  };
}

async function inspectAppUIModel(projectRoot: string): Promise<unknown> {
  const projectConfig = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, projectConfig.config);
  const source = await readFile(
    paths.appUIModelPath,
    "utf8",
  );
  if (source.length > MAX_APP_UI_MODEL_CHARACTERS) {
    throw new UIOperatorError(
      "APP_UI_MODEL_TOO_LARGE",
      `${path.relative(projectRoot, paths.appUIModelPath)} has ${source.length} characters; the inspect limit is ${MAX_APP_UI_MODEL_CHARACTERS}. Use the bounded project snapshot or read the file in sections.`,
      { characters: source.length, limit: MAX_APP_UI_MODEL_CHARACTERS },
    );
  }

  const inspection = await inspectUIProject(projectRoot);
  return {
    hash: createHash("sha256").update(source).digest("hex"),
    source,
    model: parseAppUIModelJson(source),
    layout: inspection.appUIModel.layout,
    slots: inspection.appUIModel.slots,
  };
}

async function listUIPlugins(projectRoot: string): Promise<unknown> {
  const source = await inspectAppUIModelSource(projectRoot);
  if (source.status !== "valid") return {
    recoveryOnly: true, rawHash: source.rawHash,
    pluginAssets: source.pluginInventory.assets.map(({ manifest: _manifest, ...asset }) => ({ ...asset, selected: false })), issues: source.pluginInventory.errors,
  };
  const inspection = await inspectUIProject(projectRoot);
  return {
    appUIModelHash: inspection.appUIModel.hash,
    capabilityCatalog: inspection.capabilityCatalog,
    activeComposition: inspection.activeComposition,
    issues: inspection.issues,
    pluginAssets: inspection.pluginAssets,
    plugins: inspection.plugins,
    catalogs: inspection.catalogs,
  };
}

async function inspectUISlots(
  projectRoot: string,
  input: z.infer<typeof inspectUISlotsInputSchema>,
): Promise<unknown> {
  const target = "target" in input ? input.target : undefined;
  const inspection = await inspectUIProject(projectRoot);
  if (target?.type === "layout_slot" && "appUIModelHash" in input) {
    if (inspection.appUIModel.hash !== input.appUIModelHash) {
      throw new UIOperatorError(
        "APP_UI_MODEL_HASH_CONFLICT",
        "AppUIModel changed after the layout Slot was inspected. Inspect the project again and retry with the new hash.",
        {
          expectedHash: input.appUIModelHash,
          actualHash: inspection.appUIModel.hash,
        },
      );
    }
  }
  const selected = target === undefined
    ? undefined
    : inspection.appUIModel.slots.find((slot) =>
        target.type === "layout_slot"
          ? slot.target.type === "layout_slot" && slot.target.slotRef === target.slotRef
          : slot.target.type === "plugin_slot" &&
            slot.target.parentInstanceId === target.parentInstanceId &&
            slot.target.slot === target.slot,
      );
  if (target !== undefined && selected === undefined) {
    throw new UIOperatorError(
      "UI_SLOT_NOT_FOUND",
      `Slot ${JSON.stringify(target)} does not exist.`,
    );
  }
  return {
    appUIModelHash: inspection.appUIModel.hash,
    slots: selected === undefined ? inspection.appUIModel.slots : [selected],
    ...(selected === undefined ? {} : { selected }),
  };
}

async function inspectUIPlugin(
  projectRoot: string,
  pluginId: string,
  sharedSymbols: readonly string[] = [],
  sharedModule?: string,
): Promise<unknown> {
  const source = await inspectAppUIModelSource(projectRoot);
  const recoveryOnly = source.status !== "valid";
  const inspection = recoveryOnly ? {
    appUIModel: { hash: source.rawHash },
    pluginAssets: source.pluginInventory.assets.map(({ manifest: _manifest, ...asset }) => ({ ...asset, selected: false })),
    plugins: [] as Awaited<ReturnType<typeof inspectUIProject>>["plugins"],
  } : await inspectUIProject(projectRoot);
  const matches = inspection.pluginAssets.filter(
    (asset) => asset.pluginId === pluginId,
  );
  if (matches.length === 0) {
    throw new UIOperatorError(
      "UI_PLUGIN_NOT_FOUND",
      `No plugins/*/manifest.json declares UI plugin "${pluginId}".`,
    );
  }
  if (matches.length > 1) {
    throw new UIOperatorError(
      "UI_PLUGIN_ID_AMBIGUOUS",
      `Multiple plugin assets declare UI plugin "${pluginId}".`,
      { manifestPaths: matches.map((asset) => asset.manifestPath) },
    );
  }

  const asset = matches[0];
  if (asset === undefined) {
    throw new UIOperatorError(
      "UI_PLUGIN_NOT_FOUND",
      `UI plugin "${pluginId}" is unavailable.`,
    );
  }
  const sharedTypes = !asset.application && sharedSymbols.length
    ? await inspectPluginSharedTypes(projectRoot, sharedSymbols, sharedModule) : undefined;
  const official = officialPackagePlugin(pluginId);
  if (official && asset.ownership === "official_package") {
    const registry = await loadAgentUISourceRegistry();
    const item = registry.byId.get(official.referenceSourceItemId)!;
    return { appUIModelHash: inspection.appUIModel.hash, asset, ...(sharedTypes ? {sharedTypes} : {}), selected: asset.selected,
      instances: inspection.plugins.filter(instance => instance.pluginId === pluginId),
      manifest: official.manifest,
      definitionSource: boundedText(item.loadedFiles.find(file => file.target.endsWith("definition.ts"))!.content.toString("utf8"), MAX_PLUGIN_SOURCE_CHARACTERS),
      services: { provides: official.services.provides, required: official.services.inject, optional: official.services.optionalInject },
      files: item.loadedFiles.map(file => ({ path: `source-registry/${file.target}`, kind: "file", bytes: file.content.length })), filesTruncated: false };
  }
  const pluginRoot = path.join(projectRoot, path.dirname(asset.manifestPath));
  const allEntries = (await readdir(pluginRoot, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  const entries = allEntries.slice(0, MAX_PLUGIN_FILES);
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.posix.join(path.posix.dirname(asset.manifestPath), entry.name);
      if (!entry.isFile()) {
        return {
          path: relativePath,
          kind: entry.isDirectory() ? "directory" : "other",
        };
      }
      return {
        path: relativePath,
        kind: "file",
        bytes: (await stat(path.join(pluginRoot, entry.name))).size,
      };
    }),
  );
  const manifestSource = await readFile(
    path.join(projectRoot, asset.manifestPath),
    "utf8",
  );
  const definitionSource = await readFile(
    path.join(projectRoot, asset.definitionPath),
    "utf8",
  );
  const projectConfig = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, projectConfig.config);
  const serviceInspection = recoveryOnly
    ? (await collectPluginProjectFacts(projectRoot, operatorConfigForPaths(paths), paths)).declarations
    : await inspectUIServices(projectRoot);
  const serviceDeclaration = serviceInspection.plugins.find(
    (plugin) => plugin.pluginId === pluginId,
  );
  // Derive navigation from actual mounted instances, never from a suggested
  // default placement or a Plugin-specific route. It carries no write grant.
  const parentTargets = inspection.plugins.filter(instance => instance.pluginId === pluginId)
    .flatMap(instance => instance.target.type === "plugin_slot" ? [instance.target] : []);
  const compositionParents = await Promise.all([...new Map(parentTargets.map(target => [target.parentInstanceId, target])).values()].slice(0, 4).map(async target => {
    const parent = inspection.plugins.find(instance => instance.id === target.parentInstanceId);
    const parentAsset = parent && inspection.pluginAssets.find(item => item.pluginId === parent.pluginId);
    const application = parentAsset?.application ? await inspectPluginApplication(projectRoot, parentAsset) : undefined;
    return { instanceId: target.parentInstanceId, slot: target.slot,
      ...(parent ? {pluginId: parent.pluginId} : {}),
      ...(application ? {entryPath: application.entryPath, entryHash: application.entryHash,
        implementationOwnership: application.implementationOwnership,
        ...("compositionContract" in application.publicApi ? {compositionContract: application.publicApi.compositionContract} : {})} : {}),
      interpretation: "Current mounted parent boundary, not a selected mutation target or authority. A child action API does not describe append/replacement behavior in its parent. Use the parent's composition contract only if that boundary answers the requested change; preserve existing actions and permission checks." };
  }));

  return {
    ...(recoveryOnly ? { recoveryOnly: true } : {}),
    appUIModelHash: inspection.appUIModel.hash,
    asset,
    ...(compositionParents.length ? {compositionParents} : {}),
    ...(sharedTypes ? {sharedTypes} : {}),
    ...(asset.application ? { application: await inspectPluginApplication(projectRoot, asset, sharedSymbols, sharedModule) } : {}),
    selected: asset.selected,
    instances: inspection.plugins.filter(
      (instance) => instance.pluginId === pluginId,
    ),
    manifest: JSON.parse(manifestSource) as unknown,
    definitionSource: boundedText(
      definitionSource,
      MAX_PLUGIN_SOURCE_CHARACTERS,
    ),
    services: {
      provides: serviceDeclaration?.provides ?? [],
      required: serviceDeclaration?.inject ?? [],
      optional: serviceDeclaration?.optionalInject ?? [],
    },
    files,
    filesTruncated: allEntries.length > MAX_PLUGIN_FILES,
  };
}

async function inspectUIServices(projectRoot: string) {
  const projectConfig = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, projectConfig.config);
  const appUIModelSource = await readFile(
    paths.appUIModelPath,
    "utf8",
  );
  const model = parseAppUIModelJson(appUIModelSource);
  const inventory = await collectPluginAssets(
    projectRoot,
    paths,
    operatorConfigForPaths(paths),
  );
  const inspection = inspectUIServiceDependencies(
    projectRoot,
    model,
    inventory.assets,
    path.dirname(paths.pluginsRoot),
    (await collectPluginProjectFacts(projectRoot, operatorConfigForPaths(paths), paths)).declarations,
  );
  return {
    appUIModelHash: createHash("sha256").update(appUIModelSource).digest("hex"),
    ...inspection,
    issues: [...inventory.errors, ...inspection.issues],
  };
}

async function inspectUIPluginSourceReferences(
  projectRoot: string,
  pluginId: string,
): Promise<unknown> {
  const source = await inspectAppUIModelSource(projectRoot);
  const recoveryOnly = source.status !== "valid";
  const inspection = recoveryOnly ? {
    appUIModel: { hash: source.rawHash },
    pluginAssets: source.pluginInventory.assets.map(({ manifest: _manifest, ...asset }) => ({ ...asset, selected: false })),
    plugins: [] as Array<{ pluginId: string }>,
  } : await inspectUIProject(projectRoot);
  const matches = inspection.pluginAssets.filter(
    (asset) => asset.pluginId === pluginId,
  );
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new UIOperatorError(
      matches.length === 0 ? "UI_PLUGIN_NOT_FOUND" : "UI_PLUGIN_ID_AMBIGUOUS",
      matches.length === 0
        ? `No plugins/*/manifest.json declares UI plugin "${pluginId}".`
        : `Multiple plugin assets declare UI plugin "${pluginId}".`,
    );
  }
  return inspectPluginSourceReferences(
    projectRoot,
    resolveAgentUIProjectPaths(projectRoot, (await readAgentUIProjectConfig(projectRoot)).config),
    pluginId,
    matches[0].directory,
  );
}

async function executeRequest(
  request: UIOperatorRequest,
  projectRoot: string,
): Promise<unknown> {
  switch (request.operation) {
    case "plan_agent_ui_integration": return planIntegrationRecipe(projectRoot, request.input);
    case "apply_agent_ui_integration": return applyIntegrationRecipe(projectRoot, request.input.recipe, true, request.input.cancelMarker);
    case "prepare_agent_ui_integration_asset": return prepareIntegrationRecipeAsset(projectRoot, request.input.recipe, true, request.input.cancelMarker);
    case "verify_agent_ui_integration": return verifyIntegrationRecipe(projectRoot, request.input.recipe);
  }
  const projectConfig = await readAgentUIProjectConfig(projectRoot);
  const effectiveConfig = operatorConfigForPaths(
    resolveAgentUIProjectPaths(projectRoot, projectConfig.config),
  );
  switch (request.operation) {
    case "inspect_app_ui_model_source":
      return inspectAppUIModelSource(projectRoot);
    case "repair_app_ui_model":
      return repairAppUIModel(projectRoot, request.input);
    case "inspect_ui_project": {
      return "view" in request.input && request.input.view === "composition"
        ? inspectUIComposition(projectRoot)
        : inspectUIProject(projectRoot);
    }
    case "inspect_app_ui_model":
      return inspectAppUIModel(projectRoot);
    case "inspect_ui_slots":
      return inspectUISlots(projectRoot, request.input);
    case "list_ui_plugins":
      return listUIPlugins(projectRoot);
    case "inspect_ui_services":
      return inspectUIServices(projectRoot);
    case "inspect_ui_plugin":
      return inspectUIPlugin(projectRoot, request.input.pluginId, request.input.sharedSymbols, request.input.sharedModule);
    case "preflight_ui_plugin_placement":
      return preflightCreatorPluginPlacement(projectRoot, request.input);
    case "inspect_ui_plugin_source_references":
      return inspectUIPluginSourceReferences(
        projectRoot,
        request.input.pluginId,
      );
    case "verify_runtime_composition":
      return verifyRuntimeComposition(projectRoot, request.input);
    case "verify_ui_project": {
      const result = await verifyUIProject(projectRoot);
      return { status: result.status, errors: result.errors, warnings: result.warnings, responsiveRiskCount: result.responsiveRiskCount };
    }
    case "plan_plugin_source_takeover": return planPluginSourceTakeover(projectRoot, request.input);
    case "takeover_plugin_source": return takeoverPluginSource(projectRoot, request.input);
    case "create_custom_plugin": return createCustomPlugin(projectRoot, request.input);
    case "migrate_official_package_plugin": return migrateOfficialPackagePlugin(projectRoot, request.input.pluginId);
    case "purge_ui_plugin":
      return purgeUIPlugin(projectRoot, request.input);
    case "mutate_app_ui_model":
      return mutateAppUIModel(projectRoot, request.input);
    case "inspect_agent_ui_sources":
      return inspectAgentUISources(projectRoot, effectiveConfig);
    case "apply_agent_ui_source_item":
      return applyAgentUISourceProjectMutation(projectRoot, request.input, { config: effectiveConfig, cancelMarker: request.input.cancelMarker });
    case "remove_agent_ui_source_items":
      return removeAgentUISourceProjectMutation(projectRoot, request.input, { config: effectiveConfig, cancelMarker: request.input.cancelMarker });
    case "synchronize_plugin_registry": {
      const paths = resolveAgentUIProjectPaths(projectRoot, projectConfig.config);
      const current = await readFile(paths.generatedPluginRegistryPath, "utf8");
      const actualHash = createHash("sha256").update(current).digest("hex");
      if (actualHash !== request.input.expectedSourceHash) {
        throw new UIOperatorError(
          "PLUGIN_REGISTRY_HASH_CONFLICT",
          "Generated Plugin Registry changed before synchronization.",
        );
      }
      return writeGeneratedPluginRegistry(projectRoot, { cancelMarker: request.input.cancelMarker });
    }
  }
}

function failure(error: unknown): UIOperatorFailure {
  if (
    error instanceof UIOperatorError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string" &&
      "message" in error &&
      typeof error.message === "string")
  ) {
    const codedError = error as {
      code: string;
      message: string;
      details?: unknown;
    };
    return {
      ok: false,
      error: {
        code: codedError.code.slice(0, 200) || "OPERATOR_OPERATION_FAILED",
        message: codedError.message.slice(0, 4000) || "Operator operation failed.",
        ...(codedError.details === undefined
          ? {}
          : { details: codedError.details }),
      },
    };
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: z.prettifyError(error).slice(0, 4000),
      },
    };
  }
  return {
    ok: false,
    error: {
      code: "OPERATOR_OPERATION_FAILED",
      message: (error instanceof Error ? error.message : String(error)).slice(0, 4000) || "Operator operation failed.",
    },
  };
}

export async function handleUIOperatorRequest(
  input: unknown,
  projectRoot = defaultProjectRoot,
  onAdmission?: () => void,
): Promise<UIOperatorResponse> {
  let release: (() => Promise<void>) | undefined;
  try {
    assertRuntimeBuildCurrent(typeof __OPERATOR_BUILD_ID__ === "undefined" ? undefined : __OPERATOR_BUILD_ID__);
    const parsed = requestSchema.parse(input);
    if (["plan_agent_ui_integration", "apply_agent_ui_integration", "prepare_agent_ui_integration_asset", "verify_agent_ui_integration"].includes(parsed.operation)) {
      if (parsed.operation === "apply_agent_ui_integration" || parsed.operation === "prepare_agent_ui_integration_asset") release = await acquireOperatorLock((await resolveCompatibilityConsumer(projectRoot))?.hostRoot ?? projectRoot);
      onAdmission?.();
      const result = await executeRequest(parsed, projectRoot);
      validateOperatorResult(parsed.operation, result);
      return { ok: true, result };
    }
    release = await acquireOperatorLock(projectRoot, { waitMs: 10_000 });
    onAdmission?.();
    const projectConfig = await readAgentUIProjectConfig(projectRoot);
    const effectiveConfig = operatorConfigForPaths(
      resolveAgentUIProjectPaths(projectRoot, projectConfig.config),
    );
    await recoverPendingPluginPurge(projectRoot);
    await recoverPendingAppUITransaction(projectRoot);
    await recoverPendingAgentUISourceProjectMutation(
      projectRoot,
      effectiveConfig,
    );
    await recoverPluginSourceTakeover(projectRoot);
    const request = requestSchema.parse(input);
    const result = await executeRequest(request, projectRoot);
    try {
      validateOperatorResult(request.operation, result);
    } catch (error) {
      throw new UIOperatorError(
        "OPERATOR_RESULT_CONTRACT_VIOLATION",
        "Operator produced a result that does not match the current contract.",
        process.env.NODE_ENV === "development"
          ? { operation: request.operation, cause: error instanceof Error ? error.message.slice(0, 2000) : "Invalid result." }
          : undefined,
      );
    }
    return { ok: true, result };
  } catch (error) {
    return failure(error);
  } finally { await release?.(); }
}

async function readStandardInput(): Promise<string> {
  let source = "";
  for await (const chunk of process.stdin) {
    source += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (Buffer.byteLength(source, "utf8") > MAX_UI_OPERATOR_INPUT_BYTES) {
      throw new UIOperatorError(
        "INPUT_TOO_LARGE",
        `Control request exceeds ${MAX_UI_OPERATOR_INPUT_BYTES} bytes.`,
      );
    }
  }
  return source;
}

export async function runUIOperatorCli(projectRoot = defaultProjectRoot): Promise<void> {
  let response: UIOperatorResponse;
  try {
    response = await handleUIOperatorRequest(
      JSON.parse(await readStandardInput()) as unknown,
      projectRoot,
      () => { process.stderr.write("AGENT_UI_OPERATOR_ADMITTED\n"); },
    );
  } catch (error) {
    response = failure(error);
  }

  let output = JSON.stringify(response);
  if (Buffer.byteLength(output, "utf8") > MAX_UI_OPERATOR_OUTPUT_BYTES) {
    output = JSON.stringify(
      failure(
        new UIOperatorError(
          "OUTPUT_TOO_LARGE",
          `Control response exceeds ${MAX_UI_OPERATOR_OUTPUT_BYTES} bytes. Narrow the inspection request.`,
        ),
      ),
    );
  }
  process.stdout.write(`${output}\n`);
  if (!response.ok) {
    process.exitCode = 1;
  }
}
