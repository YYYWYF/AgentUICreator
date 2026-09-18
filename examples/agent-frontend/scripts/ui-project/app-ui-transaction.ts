import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  parseAppUIModel,
  parseAppUIModelJson,
  buildLayoutRefIndex,
  collectAppUIPluginLocations,
  type AppUIColumnNode,
  type AppUIPluginNode,
  type AppUIRowNode,
  type AppUIModel,
  type AppUILayoutNode,
} from "../../framework/contracts/app-ui-model";
import { compileAppUIModel } from "../../framework/contracts/app-ui-compiler";
import type { AppUIRuntimeModel } from "../../framework/contracts/app-ui-runtime-model";
import {
  appUIOperationsSchema,
  applyAppUIOperations,
  planPluginMove,
  resolveDefaultPluginRemovalReflow,
  type AppUIOperation,
  type AppUIOperationApplyOptions,
  type AppUIPluginMoveContracts,
  type AppUIPluginTarget,
} from "./app-ui-operations";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
} from "./registry-generator";
import { verifyPluginChildSlots } from "./plugin-child-slot-verifier";
import type { PluginAsset, ProjectIssue } from "./types";

const APP_UI_MODEL_PATH = "app-ui/app-ui.json";
export const COMPOSITION_REVISION_PATH =
  "app-ui/composition-revision.generated.json";
const TRANSACTION_DIRECTORY_PATH = ".agentuicreator/control";
const TRANSACTION_JOURNAL_PATH = `${TRANSACTION_DIRECTORY_PATH}/pending-app-ui-transaction.json`;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/** Admission checks performed before the AppUIModel transaction commits. */
export const APP_UI_MUTATION_ADMISSION_GUARANTEES = [
  "app-ui-model-hash",
  "operation-and-model-schema",
  "capability-and-definition-resolution",
  "active-composition-compile",
  "layout-width-compatibility",
  "plugin-child-slot-contract",
] as const;

export const appUITransactionInputSchema = z.strictObject({
  appUIModelHash: z.string().regex(SHA256_PATTERN),
  operations: appUIOperationsSchema,
  runtimeSlotWidths: z
    .record(
      z.string().trim().min(1).max(200),
      z.enum(["unknown", "narrow", "wide"]),
    )
    .optional(),
});

export type AppUITransactionInput = z.infer<typeof appUITransactionInputSchema>;

interface JournalFileState {
  exists: boolean;
  source?: string | undefined;
  hash: string;
}

interface JournalFile {
  relativePath: string;
  temporaryPath: string;
  before: JournalFileState;
  after: JournalFileState;
}

interface AppUITransactionJournal {
  schemaVersion: 1;
  transactionId: string;
  files: JournalFile[];
}

export interface AppUITransactionTestOptions {
  simulateCrashAfterRename?: number | undefined;
}

export interface AppUITransactionResult {
  schemaVersion: 1;
  transactionId: string;
  changed: boolean;
  changedPaths: string[];
  appUIModel: {
    beforeHash: string;
    afterHash: string;
  };
  diff: {
    plugins: {
      added: string[];
      removed: string[];
      updated: string[];
    };
    layoutNodes: {
      added: string[];
      removed: string[];
      updated: string[];
    };
    slots: {
      added: string[];
      removed: string[];
      updated: string[];
    };
    capabilityCatalog: {
      changed: boolean;
      addedPluginIds: string[];
      removedPluginIds: string[];
    };
  };
  activeComposition: {
    selectedPluginIds: string[];
    resolvedPluginIds: string[];
    headlessPluginIds: string[];
  };
  warnings: ProjectIssue[];
  snapshotToken: {
    appUIModelHash: string;
    capabilityCatalogSourceHash: string;
    capabilityCatalogRevision: string;
  };
  compositionRevision?: {
    transactionId: string;
    appUIModelHash: string;
    capabilityCatalogRevision: string;
  };
  semanticComposition?: {
    operation: "insert_plugin_default" | "remove_plugin_default" | "move_plugin_to";
    semanticLoweringSucceeded: true;
    expectedRuntime: {
      presentInstanceIds?: string[];
      absentInstanceIds?: string[];
    };
    expectedPlacement?:
      | {
          type: "relative";
          instanceId: string;
          anchorInstanceId: string;
          relation: "before" | "after";
        }
      | {
          type: "plugin_slot";
          instanceId: string;
          parentInstanceId: string;
          slot: string;
        };
    expectedGeometry?: {
      instanceId: string;
      anchorInstanceId: string;
      relation: "before" | "after" | "above" | "below";
      axis: "width" | "height";
      size: string;
    };
    reflow?: "collapsed-dedicated-region" | "preserved-container";
  };
}

export class AppUITransactionError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppUITransactionError";
    this.code = code;
    this.details = details;
  }
}

class SimulatedTransactionCrash extends Error {}

const projectLockTails = new Map<string, Promise<void>>();

async function withProjectLock<T>(
  projectRoot: string,
  task: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(projectRoot);
  const previous = projectLockTails.get(key) ?? Promise.resolve();
  let release = (): void => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  projectLockTails.set(key, current);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (projectLockTails.get(key) === current) {
      projectLockTails.delete(key);
    }
  }
}

function hash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function missingHash(): string {
  return hash("<missing>");
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

function fileState(source: string | undefined): JournalFileState {
  return source === undefined
    ? { exists: false, hash: missingHash() }
    : { exists: true, source, hash: hash(source) };
}

async function atomicWrite(filePath: string, source: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, source, "utf8");
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
  }
}

async function removeIfPresent(filePath: string): Promise<void> {
  await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
}

async function restoreState(
  projectRoot: string,
  file: JournalFile,
  state: JournalFileState,
): Promise<void> {
  const absolutePath = path.join(projectRoot, file.relativePath);
  if (state.exists) {
    await atomicWrite(absolutePath, state.source!);
  } else {
    await removeIfPresent(absolutePath);
  }
}

async function restoreBeforeIfOwned(
  projectRoot: string,
  file: JournalFile,
): Promise<void> {
  const absolutePath = path.join(projectRoot, file.relativePath);
  const current = fileState(await readOptional(absolutePath));
  if (current.hash !== file.before.hash && current.hash !== file.after.hash) {
    throw new AppUITransactionError(
      "APP_UI_TRANSACTION_ROLLBACK_CONFLICT",
      `Cannot roll back ${file.relativePath} because it changed outside the transaction.`,
      {
        path: file.relativePath,
        currentHash: current.hash,
        beforeHash: file.before.hash,
        afterHash: file.after.hash,
      },
    );
  }
  await restoreState(projectRoot, file, file.before);
}

async function ensureControlDirectory(projectRoot: string): Promise<void> {
  const creatorDirectory = path.join(projectRoot, ".agentuicreator");
  await mkdir(path.join(projectRoot, TRANSACTION_DIRECTORY_PATH), {
    recursive: true,
  });
  await writeFile(
    path.join(creatorDirectory, ".gitignore"),
    "*\n!.gitignore\n",
    { encoding: "utf8", flag: "wx" },
  ).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") {
      throw error;
    }
  });
}

async function writeJournal(
  projectRoot: string,
  journal: AppUITransactionJournal,
): Promise<void> {
  await ensureControlDirectory(projectRoot);
  await atomicWrite(
    path.join(projectRoot, TRANSACTION_JOURNAL_PATH),
    `${JSON.stringify(journal, null, 2)}\n`,
  );
}

function parseJournal(input: unknown): AppUITransactionJournal {
  const stateSchema = z.strictObject({
    exists: z.boolean(),
    source: z.string().optional(),
    hash: z.string().regex(SHA256_PATTERN),
  });
  const journal = z.strictObject({
    schemaVersion: z.literal(1),
    transactionId: z.string().uuid(),
    files: z.array(
      z.strictObject({
        relativePath: z.enum([
          APP_UI_MODEL_PATH,
          COMPOSITION_REVISION_PATH,
          GENERATED_PLUGIN_REGISTRY_PATH,
        ]),
        temporaryPath: z.string().min(1),
        before: stateSchema,
        after: stateSchema,
      }),
    ).min(1).max(3),
  }).parse(input);
  const paths = new Set<string>();
  for (const file of journal.files) {
    if (paths.has(file.relativePath)) {
      throw new Error(`Duplicate transaction file: ${file.relativePath}`);
    }
    paths.add(file.relativePath);
    for (const [label, state] of [
      ["before", file.before],
      ["after", file.after],
    ] as const) {
      if (state.exists !== (state.source !== undefined)) {
        throw new Error(`${file.relativePath} ${label} state is inconsistent.`);
      }
      const actualHash = state.source === undefined ? missingHash() : hash(state.source);
      if (actualHash !== state.hash) {
        throw new Error(`${file.relativePath} ${label} hash is invalid.`);
      }
    }
    if (!file.after.exists) {
      throw new Error(`${file.relativePath} after state must exist.`);
    }
  }
  return journal;
}

export async function recoverPendingAppUITransaction(
  projectRoot: string,
): Promise<void> {
  const journalPath = path.join(projectRoot, TRANSACTION_JOURNAL_PATH);
  const source = await readOptional(journalPath);
  if (source === undefined) {
    return;
  }
  let journal: AppUITransactionJournal;
  try {
    journal = parseJournal(JSON.parse(source) as unknown);
  } catch (error) {
    throw new AppUITransactionError(
      "APP_UI_TRANSACTION_JOURNAL_INVALID",
      "The pending AppUI transaction journal is invalid; refusing to overwrite project files.",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }

  const controlDirectory = path.resolve(
    projectRoot,
    TRANSACTION_DIRECTORY_PATH,
  );
  for (const file of journal.files) {
    const temporaryPath = path.resolve(file.temporaryPath);
    if (!temporaryPath.startsWith(`${controlDirectory}${path.sep}`)) {
      throw new AppUITransactionError(
        "APP_UI_TRANSACTION_JOURNAL_INVALID",
        "The pending AppUI transaction journal references an invalid temporary path.",
        { temporaryPath: file.temporaryPath },
      );
    }
  }

  for (const file of journal.files) {
    const current = fileState(
      await readOptional(path.join(projectRoot, file.relativePath)),
    );
    if (current.hash !== file.before.hash && current.hash !== file.after.hash) {
      throw new AppUITransactionError(
        "APP_UI_TRANSACTION_RECOVERY_CONFLICT",
        `Cannot recover transaction ${journal.transactionId} because ${file.relativePath} changed outside the transaction.`,
        {
          path: file.relativePath,
          currentHash: current.hash,
          beforeHash: file.before.hash,
          afterHash: file.after.hash,
        },
      );
    }
  }

  for (const file of journal.files) {
    await restoreState(projectRoot, file, file.after);
    await removeIfPresent(file.temporaryPath);
  }
  await removeIfPresent(journalPath);
}

function generatedCapabilityPluginIds(source: string | undefined): string[] {
  if (source === undefined) return [];
  return [...source.matchAll(/manifest:\s*\{\s*"id":\s*"([^"]+)"/gu)]
    .flatMap((match) => match[1] === undefined ? [] : [match[1]])
    .sort();
}

function validateMountSemantics(model: AppUIModel): ProjectIssue[] {
  return collectAppUIPluginLocations(model)
    .filter(({ plugin, target }) => !plugin.enabled && target.type !== "application")
    .map(({ plugin }) => ({
      code: "disabled-plugin-in-tree",
      message: `Disabled plugin instance "${plugin.id}" remains in the authoring tree but will not render.`,
    }));
}

function mapInstances(model: AppUIModel): Map<string, string> {
  return new Map(
    collectAppUIPluginLocations(model).map(({ plugin, target, index }) => [
      plugin.id,
      JSON.stringify({
        plugin,
        target:
          target.type === "layout_slot"
            ? { type: target.type, slotPath: target.slotPath }
            : target,
        index,
      }),
    ]),
  );
}

function mapLayoutNodes(root: AppUILayoutNode): Map<string, string> {
  const refs = buildLayoutRefIndex(root);
  return new Map(
    [...refs.byRef.entries()].map(([ref, node]) => [
      ref,
      JSON.stringify(node),
    ]),
  );
}

function mapSlots(model: AppUIModel): Map<string, string> {
  const refs = buildLayoutRefIndex(model.root);
  return new Map(
    [...refs.byRef.entries()]
      .filter(([, node]) => node.type === "slot")
      .map(([ref, node]) => [ref, JSON.stringify(node)]),
  );
}

function changedKeys(
  before: Map<string, string>,
  after: Map<string, string>,
): { added: string[]; removed: string[]; updated: string[] } {
  const added = [...after.keys()].filter((key) => !before.has(key)).sort();
  const removed = [...before.keys()].filter((key) => !after.has(key)).sort();
  const updated = [...after.keys()]
    .filter((key) => before.has(key) && before.get(key) !== after.get(key))
    .sort();
  return { added, removed, updated };
}

async function commitFiles(
  projectRoot: string,
  transactionId: string,
  changes: Array<{ relativePath: string; before: string | undefined; after: string }>,
  options: AppUITransactionTestOptions,
): Promise<void> {
  const files: JournalFile[] = changes.map((change) => ({
    relativePath: change.relativePath,
    temporaryPath: path.join(
      projectRoot,
      TRANSACTION_DIRECTORY_PATH,
      `${transactionId}-${path.basename(change.relativePath)}.tmp`,
    ),
    before: fileState(change.before),
    after: fileState(change.after),
  }));
  const journal: AppUITransactionJournal = {
    schemaVersion: 1,
    transactionId,
    files,
  };

  try {
    await ensureControlDirectory(projectRoot);
    await writeJournal(projectRoot, journal);
    for (const file of files) {
      await writeFile(file.temporaryPath, file.after.source!, "utf8");
    }
    let renameCount = 0;
    for (const file of files) {
      await rename(file.temporaryPath, path.join(projectRoot, file.relativePath));
      renameCount += 1;
      if (options.simulateCrashAfterRename === renameCount) {
        throw new SimulatedTransactionCrash("Simulated AppUI transaction crash");
      }
    }
    await removeIfPresent(path.join(projectRoot, TRANSACTION_JOURNAL_PATH));
  } catch (error) {
    if (error instanceof SimulatedTransactionCrash) {
      throw error;
    }
    try {
      for (const file of files) {
        await restoreBeforeIfOwned(projectRoot, file);
        await removeIfPresent(file.temporaryPath);
      }
      await removeIfPresent(path.join(projectRoot, TRANSACTION_JOURNAL_PATH));
    } catch (rollbackError) {
      throw new AppUITransactionError(
        "APP_UI_TRANSACTION_ROLLBACK_FAILED",
        "AppUI transaction failed and could not be rolled back completely.",
        {
          cause: error instanceof Error ? error.message : String(error),
          rollbackCause:
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError),
        },
      );
    }
    throw error;
  }
}

function semanticModelSource(
  before: AppUIModel,
  beforeSource: string,
  after: AppUIModel,
): string {
  return JSON.stringify(before) === JSON.stringify(after)
    ? beforeSource
    : `${JSON.stringify(after, null, 2)}\n`;
}

function authoringTargetForInstance(
  model: AppUIModel,
  instanceId: string,
): AppUIPluginTarget | undefined {
  const location = collectAppUIPluginLocations(model).find(
    ({ plugin }) => plugin.id === instanceId,
  );
  if (location === undefined) return undefined;
  if (location.target.type === "application") {
    return { type: "application" };
  }
  if (location.target.type === "plugin_slot") {
    return {
      type: "plugin_slot",
      parentInstanceId: location.target.parentInstanceId,
      slot: location.target.slot,
    };
  }
  const slotRef = buildLayoutRefIndex(model.root).byPath.get(
    location.target.slotPath,
  );
  return slotRef === undefined
    ? undefined
    : { type: "layout_slot", slotRef };
}

type SemanticInsertPluginDefault = Extract<
  AppUIOperation,
  { type: "insert_plugin_default" }
>;

type SemanticRemovePluginDefault = Extract<
  AppUIOperation,
  { type: "remove_plugin_default" }
>;

type SemanticMovePluginTo = Extract<
  AppUIOperation,
  { type: "move_plugin_to" }
>;

type SemanticPlacementRelation =
  | "before"
  | "after"
  | "above"
  | "below";

interface SemanticLoweringResult {
  operations: AppUIOperation[];
  semanticComposition: NonNullable<AppUITransactionResult["semanticComposition"]>;
  pluginMoveContracts?: AppUIPluginMoveContracts | undefined;
}

function pluginMoveContractsForGeneration(
  generation: Awaited<ReturnType<typeof generatePluginRegistry>>,
): AppUIPluginMoveContracts {
  return {
    pluginCapabilities: new Map(
      generation.assets.map((asset) => [asset.pluginId, asset.capabilities] as const),
    ),
    pluginSlots: generation.activeComposition.slotCatalog,
  };
}

type VisualRegionResolution =
  | {
      mode: "existing-axis-parent";
      anchorRef: string;
      parentRef: string;
      parent: AppUIRowNode | AppUIColumnNode;
    }
  | {
      mode: "root-anchor";
      anchorRef: string;
      anchorSize: string;
    };

function semanticPlacementError(
  code:
    | "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE"
    | "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS"
    | "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
  message: string,
  details?: unknown,
): never {
  throw new AppUITransactionError(code, message, details);
}

function isVisualAsset(asset: PluginAsset | undefined): asset is PluginAsset {
  return (
    asset !== undefined &&
    asset.applicationGate === undefined &&
    !asset.capabilities.includes("headless")
  );
}

function normalizeAuthoringTrackSize(
  value: unknown,
  options: {
    pluginId: string;
    axis: "width" | "height";
  },
): string {
  const { pluginId, axis } = options;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      semanticPlacementError(
        "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
        `Plugin "${pluginId}" does not declare a positive ${axis} for an authoring-default region.`,
        { pluginId, axis, value },
      );
    }
    return `${value}px`;
  }

  if (typeof value !== "string") {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
      `Plugin "${pluginId}" does not declare a usable ${axis} for its authoring-default placement.`,
      { pluginId, axis },
    );
  }

  const normalized = value.trim();
  if (
    !normalized ||
    /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*$/u.test(normalized) ||
    /(?:^|\s)(?:auto|fit-content|max-content|min-content)(?:$|\s)/iu.test(
      normalized,
    )
  ) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Plugin "${pluginId}" does not declare a fixed ${axis} suitable for a dedicated authoring-default region.`,
      { pluginId, axis, value },
    );
  }
  return normalized;
}

function resolveRootAnchorTrackSize(
  branch: AppUILayoutNode,
  anchorAsset: PluginAsset,
  axis: "width" | "height",
): string {
  const currentPanelSize = branch.type === "panel"
    ? branch[axis]
    : undefined;
  if (currentPanelSize !== undefined) {
    return normalizeAuthoringTrackSize(currentPanelSize, {
      pluginId: anchorAsset.pluginId,
      axis,
    });
  }

  const recommendedSize = anchorAsset.authoring?.recommendedSize?.[axis];
  if (recommendedSize === undefined) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor Plugin "${anchorAsset.pluginId}" does not provide a deterministic ${axis} for a root authoring-default region.`,
      { anchorPluginId: anchorAsset.pluginId, axis },
    );
  }
  return normalizeAuthoringTrackSize(recommendedSize, {
    pluginId: anchorAsset.pluginId,
    axis,
  });
}

function resolveVisualRegion(
  model: AppUIModel,
  anchorInstanceId: string,
  relation: SemanticPlacementRelation,
  anchorAsset: PluginAsset,
): VisualRegionResolution {
  const location = collectAppUIPluginLocations(model).find(
    ({ plugin }) => plugin.id === anchorInstanceId,
  );
  if (location === undefined || location.target.type !== "layout_slot") {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor Plugin instance "${anchorInstanceId}" is not a direct visual Layout instance.`,
      { anchorInstanceId },
    );
  }

  const refs = buildLayoutRefIndex(model.root);
  const slotEntry = refs.entries.find(
    (entry) => entry.path === location.target.slotPath,
  );
  if (slotEntry === undefined || slotEntry.node.type !== "slot") {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor Plugin instance "${anchorInstanceId}" does not resolve to a Layout Slot.`,
      { anchorInstanceId },
    );
  }
  if (slotEntry.node.plugins.length !== 1) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor region for "${anchorInstanceId}" is shared by multiple Layout Plugins.`,
      { anchorInstanceId, pluginCount: slotEntry.node.plugins.length },
    );
  }

  let branch: AppUILayoutNode = slotEntry.node;
  let entry = slotEntry;
  while (entry.parentKind === "panel" && entry.parent?.type === "panel") {
    branch = entry.parent;
    const parentEntry = refs.entries.find((candidate) => candidate.node === branch);
    if (parentEntry === undefined) {
      semanticPlacementError(
        "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
        `Anchor region for "${anchorInstanceId}" is detached from the Layout tree.`,
        { anchorInstanceId },
      );
    }
    entry = parentEntry;
  }

  const expectedParentType = relation === "above" || relation === "below"
    ? "column"
    : "row";
  const axis = relation === "above" || relation === "below"
    ? "height"
    : "width";
  const anchorRef = refs.byNode.get(branch);
  if (anchorRef === undefined) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor region for "${anchorInstanceId}" has no stable authoring reference.`,
      { anchorInstanceId },
    );
  }

  if (entry.parentKind === "root") {
    return {
      mode: "root-anchor",
      anchorRef,
      anchorSize: resolveRootAnchorTrackSize(branch, anchorAsset, axis),
    };
  }

  if (
    entry.parentKind !== "children" ||
    entry.parent === undefined ||
    entry.index === undefined ||
    entry.parent.type !== expectedParentType
  ) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor region for "${anchorInstanceId}" is not a direct child of a supported ${expectedParentType}.`,
      {
        anchorInstanceId,
        expectedParentType,
        actualParentType: entry.parent?.type,
        parentKind: entry.parentKind,
      },
    );
  }

  const parentRef = refs.byNode.get(entry.parent);
  if (parentRef === undefined) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor region for "${anchorInstanceId}" has no stable authoring reference.`,
      { anchorInstanceId },
    );
  }

  return {
    mode: "existing-axis-parent",
    anchorRef,
    parentRef,
    parent: entry.parent,
  };
}

function serviceReadinessForAsset(
  asset: PluginAsset,
  generation: Awaited<ReturnType<typeof generatePluginRegistry>>,
): { status: "resolved" | "not-required" | "unresolved"; missing: string[] } {
  const declaration = generation.serviceDependencies.plugins.find(
    (candidate) => candidate.pluginId === asset.pluginId,
  );
  if (declaration === undefined) {
    return { status: "unresolved", missing: [] };
  }
  if (declaration.inject.length === 0) {
    return { status: "not-required", missing: [] };
  }
  const services = new Map(
    generation.serviceDependencies.services.map((service) => [service.name, service.status]),
  );
  const missing = declaration.inject.filter(
    (name) => services.get(name) !== "available",
  );
  return {
    status: missing.length === 0 ? "resolved" : "unresolved",
    missing,
  };
}

async function lowerSemanticCompositionOperations(
  projectRoot: string,
  model: AppUIModel,
  operations: readonly AppUIOperation[],
): Promise<SemanticLoweringResult | undefined> {
  const semanticOperations = operations.filter(
    (
      operation,
    ): operation is
      | SemanticInsertPluginDefault
      | SemanticRemovePluginDefault
      | SemanticMovePluginTo =>
      operation.type === "insert_plugin_default" ||
      operation.type === "remove_plugin_default" ||
      operation.type === "move_plugin_to",
  );
  if (semanticOperations.length === 0) return undefined;
  if (semanticOperations.length !== 1 || operations.length !== 1) {
    if (semanticOperations.some((operation) => operation.type === "move_plugin_to")) {
      throw new AppUITransactionError(
        "AUTHORING_MOVE_UNSUPPORTED",
        "A semantic Plugin move must be the only operation in its transaction.",
        { operationCount: operations.length, semanticOperationCount: semanticOperations.length },
      );
    }
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      "A Productized semantic Plugin operation must be the only operation in its transaction.",
      { operationCount: operations.length, semanticOperationCount: semanticOperations.length },
    );
  }

  const operation = semanticOperations[0]!;
  if (operation.type === "move_plugin_to") {
    const generation = await generatePluginRegistry(projectRoot, model);
    const pluginMoveContracts = pluginMoveContractsForGeneration(generation);
    planPluginMove(model, operation, pluginMoveContracts);
    return {
      operations: [operation],
      pluginMoveContracts,
      semanticComposition: {
        operation: "move_plugin_to",
        semanticLoweringSucceeded: true,
        expectedRuntime: {
          presentInstanceIds: [operation.instanceId],
        },
        expectedPlacement: operation.placement.type === "relative"
          ? {
              type: "relative",
              instanceId: operation.instanceId,
              anchorInstanceId: operation.placement.anchorInstanceId,
              relation: operation.placement.relation,
            }
          : {
              type: "plugin_slot",
              instanceId: operation.instanceId,
              parentInstanceId: operation.placement.parentInstanceId,
              slot: operation.placement.slot,
            },
      },
    };
  }
  if (operation.type === "remove_plugin_default") {
    const reflow = resolveDefaultPluginRemovalReflow(
      model,
      operation.instanceId,
    );
    return {
      operations: [operation],
      semanticComposition: {
        operation: "remove_plugin_default",
        semanticLoweringSucceeded: true,
        expectedRuntime: {
          absentInstanceIds: [operation.instanceId],
        },
        reflow,
      },
    };
  }

  const generation = await generatePluginRegistry(projectRoot, model);
  const assetMatches = generation.assets.filter(
    (asset) => asset.pluginId === operation.plugin.pluginId,
  );
  if (assetMatches.length === 0) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
      `No existing UI Plugin asset matches "${operation.plugin.pluginId}".`,
      { pluginId: operation.plugin.pluginId },
    );
  }
  if (assetMatches.length !== 1) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS",
      `UI Plugin asset "${operation.plugin.pluginId}" is not uniquely resolvable.`,
      { pluginId: operation.plugin.pluginId, matches: assetMatches.map((asset) => asset.manifestPath) },
    );
  }
  const asset = assetMatches[0]!;
  if (!isVisualAsset(asset) || operation.plugin.enabled !== true) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `UI Plugin "${operation.plugin.pluginId}" is not an enabled visual asset eligible for authoring-default insertion.`,
      { pluginId: operation.plugin.pluginId },
    );
  }
  if (collectAppUIPluginLocations(model).some(({ plugin }) => plugin.pluginId === asset.pluginId)) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
      `UI Plugin "${asset.pluginId}" is already selected in the current Composition.`,
      { pluginId: asset.pluginId },
    );
  }
  if (collectAppUIPluginLocations(model).some(({ plugin }) => plugin.id === operation.plugin.id)) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS",
      `Plugin instance "${operation.plugin.id}" already exists in the current Composition.`,
      { instanceId: operation.plugin.id },
    );
  }

  const authoring = asset.authoring;
  const placement = authoring?.typicalPlacement;
  if (placement === undefined) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
      `UI Plugin "${asset.pluginId}" does not declare an authoring-default placement.`,
      { pluginId: asset.pluginId },
    );
  }
  const anchorMatches = collectAppUIPluginLocations(model).filter(
    ({ plugin }) => plugin.pluginId === placement.anchorPluginId && plugin.enabled,
  );
  if (anchorMatches.length !== 1) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS",
      `Authoring-default anchor "${placement.anchorPluginId}" does not resolve to exactly one enabled instance.`,
      {
        anchorPluginId: placement.anchorPluginId,
        matchingInstanceIds: anchorMatches.map(({ plugin }) => plugin.id),
      },
    );
  }
  const anchor = anchorMatches[0]!;
  const anchorAssetMatches = generation.assets.filter(
    (candidate) => candidate.pluginId === anchor.plugin.pluginId,
  );
  if (anchorAssetMatches.length !== 1) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Authoring-default anchor "${placement.anchorPluginId}" is not a uniquely resolvable visual asset.`,
      { anchorPluginId: placement.anchorPluginId },
    );
  }
  const anchorAsset = anchorAssetMatches[0];
  if (!isVisualAsset(anchorAsset)) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Authoring-default anchor "${placement.anchorPluginId}" is not a uniquely resolvable visual asset.`,
      { anchorPluginId: placement.anchorPluginId },
    );
  }

  const readiness = serviceReadinessForAsset(asset, generation);
  if (readiness.status === "unresolved") {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
      `UI Plugin "${asset.pluginId}" has unresolved required Services.`,
      { pluginId: asset.pluginId, missingRequiredServices: readiness.missing },
    );
  }

  const axis = placement.relation === "above" || placement.relation === "below"
    ? "height"
    : "width";
  const recommendedSize = authoring?.recommendedSize?.[axis];
  const trackSize = normalizeAuthoringTrackSize(recommendedSize, {
    pluginId: asset.pluginId,
    axis,
  });
  const region = resolveVisualRegion(
    model,
    anchor.plugin.id,
    placement.relation,
    anchorAsset,
  );
  if (region.mode === "existing-axis-parent" &&
      region.parent.sizes !== undefined &&
      region.parent.sizes.length !== region.parent.children.length) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      "The anchor Row/Column has an invalid child-to-track relationship.",
      { parentRef: region.parentRef },
    );
  }

  const direction = placement.relation === "before"
    ? "left"
    : placement.relation === "after"
      ? "right"
      : placement.relation;
  const panel: AppUILayoutNode = {
    type: "panel",
    ...(axis === "width" ? { width: trackSize } : { height: trackSize }),
    child: {
      type: "slot",
      plugins: [structuredClone(operation.plugin) as AppUIPluginNode],
    },
  };
  const loweredOperations: AppUIOperation[] = [];
  if (region.mode === "existing-axis-parent" && region.parent.sizes === undefined) {
    loweredOperations.push({
      type: "update_layout_node_props",
      nodeRef: region.parentRef,
      set: {
        sizes: region.parent.children.map(() => "minmax(0, 1fr)"),
      },
    });
  }
  loweredOperations.push({
    type: "insert_layout_relative",
    anchorRef: region.anchorRef,
    direction,
    node: panel,
    size: trackSize,
    ...(region.mode === "root-anchor" ? { anchorSize: region.anchorSize } : {}),
  });

  return {
    operations: loweredOperations,
    semanticComposition: {
      operation: "insert_plugin_default",
      semanticLoweringSucceeded: true,
      expectedRuntime: {
        presentInstanceIds: [operation.plugin.id],
      },
      expectedGeometry: {
        instanceId: operation.plugin.id,
        anchorInstanceId: anchor.plugin.id,
        relation: placement.relation,
        axis,
        size: trackSize,
      },
    },
  };
}

function widthSensitiveTargets(
  beforeModel: AppUIModel,
  operations: readonly AppUIOperation[],
): Map<string, AppUIPluginTarget> {
  const targets = new Map<string, AppUIPluginTarget>();
  for (const operation of operations) {
    switch (operation.type) {
      case "insert_plugin":
        if (operation.target.type !== "application") {
          targets.set(operation.plugin.id, operation.target);
        }
        break;
      case "move_plugin":
        if (operation.target.type !== "application") {
          targets.set(operation.instanceId, operation.target);
        }
        break;
      case "move_plugin_to":
        if (operation.placement.type === "plugin_slot") {
          targets.set(operation.instanceId, {
            type: "plugin_slot",
            parentInstanceId: operation.placement.parentInstanceId,
            slot: operation.placement.slot,
          });
        }
        break;
      case "replace_plugin": {
        const target = authoringTargetForInstance(beforeModel, operation.instanceId);
        if (target !== undefined && target.type !== "application") {
          targets.set(operation.replacement.id, target);
        }
        break;
      }
      default:
        break;
    }
  }
  return targets;
}

function assertPluginWidthCompatibility(
  beforeModel: AppUIModel,
  model: AppUIRuntimeModel,
  operations: readonly AppUIOperation[],
  assets: readonly {
    pluginId: string;
    layoutWidth?: "narrow" | "wide" | undefined;
  }[],
  runtimeSlotWidths: Readonly<Record<string, "unknown" | "narrow" | "wide">>,
): void {
  const assetsById = new Map(assets.map((asset) => [asset.pluginId, asset]));
  for (const [instanceId, target] of widthSensitiveTargets(beforeModel, operations)) {
    const instance = model.pluginInstances[instanceId];
    const slotId = instance?.mount?.slotId;
    if (
      instance === undefined ||
      slotId === undefined ||
      assetsById.get(instance.pluginId)?.layoutWidth !== "wide" ||
      runtimeSlotWidths[slotId] !== "narrow"
    ) {
      continue;
    }
    throw new AppUITransactionError(
      "PLUGIN_WIDTH_INCOMPATIBLE",
      `UI plugin "${instance.pluginId}" requires a wide container, but its current container is narrow.`,
      {
        pluginId: instance.pluginId,
        instanceId,
        target,
        requiredWidth: "wide",
        actualWidthClass: "narrow",
      },
    );
  }
}

async function runTransaction(
  projectRoot: string,
  input: AppUITransactionInput,
  options: AppUITransactionTestOptions,
): Promise<AppUITransactionResult> {
  await recoverPendingAppUITransaction(projectRoot);
  const appUIModelPath = path.join(projectRoot, APP_UI_MODEL_PATH);
  const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
  const beforeModelSource = await readFile(appUIModelPath, "utf8");
  const beforeHash = hash(beforeModelSource);
  if (beforeHash !== input.appUIModelHash) {
    throw new AppUITransactionError(
      "APP_UI_MODEL_HASH_CONFLICT",
      "AppUIModel changed after it was inspected. Inspect the project again and retry with the new hash.",
      { expectedHash: input.appUIModelHash, actualHash: beforeHash },
    );
  }

  let beforeModel: AppUIModel;
  let afterModel: AppUIModel;
  let loweredOperations: AppUIOperation[] = input.operations as AppUIOperation[];
  let semanticComposition: AppUITransactionResult["semanticComposition"];
  let operationApplyOptions: AppUIOperationApplyOptions | undefined;
  try {
    beforeModel = parseAppUIModelJson(beforeModelSource);
    const lowered = await lowerSemanticCompositionOperations(
      projectRoot,
      beforeModel,
      loweredOperations,
    );
    if (lowered !== undefined) {
      loweredOperations = lowered.operations;
      semanticComposition = lowered.semanticComposition;
      if (lowered.pluginMoveContracts !== undefined) {
        operationApplyOptions = {
          pluginMoveContracts: lowered.pluginMoveContracts,
        };
      }
    }
    afterModel = parseAppUIModel(
      applyAppUIOperations(beforeModel, loweredOperations, operationApplyOptions),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
    ) {
      throw error;
    }
    throw new AppUITransactionError(
      "APP_UI_MODEL_INVALID",
      "The semantic operations do not produce a valid AppUIModel.",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }

  const generation = await generatePluginRegistry(projectRoot, afterModel);
  if (generation.errors.length > 0) {
    throw new AppUITransactionError(
      "PLUGIN_REGISTRY_GENERATION_FAILED",
      "The transaction cannot resolve a complete capability catalog and Active Registry.",
      { issues: generation.errors },
    );
  }
  const runtimeModel = compileAppUIModel(
    afterModel,
    generation.activeComposition.compositionCatalog,
  );
  assertPluginWidthCompatibility(
    beforeModel,
    runtimeModel,
    loweredOperations,
    generation.assets,
    input.runtimeSlotWidths ?? {},
  );
  const selectedPluginIdSet = new Set(
    generation.activeComposition.selectedPluginIds,
  );
  const childSlotIssues = await verifyPluginChildSlots(
    projectRoot,
    generation.assets.filter((asset) => selectedPluginIdSet.has(asset.pluginId)),
  );
  if (childSlotIssues.length > 0) {
    throw new AppUITransactionError(
      "PLUGIN_CHILD_SLOT_CONTRACT_INVALID",
      "Selected UI plugins contain inconsistent child Slot contracts.",
      { issues: childSlotIssues },
    );
  }
  const warnings = validateMountSemantics(afterModel);
  const afterModelSource = semanticModelSource(
    beforeModel,
    beforeModelSource,
    afterModel,
  );
  const afterHash = hash(afterModelSource);
  const beforeRegistrySource = await readOptional(registryPath);
  const transactionId = randomUUID();
  const compositionRevision = {
    transactionId,
    appUIModelHash: afterHash,
    capabilityCatalogRevision: generation.capabilityCatalog.revision,
  };
  const compositionRevisionPath = path.join(
    projectRoot,
    COMPOSITION_REVISION_PATH,
  );
  const beforeCompositionRevisionSource = await readOptional(
    compositionRevisionPath,
  );
  const afterCompositionRevisionSource =
    `${JSON.stringify(compositionRevision, null, 2)}\n`;
  const catalogChanged =
    beforeRegistrySource !== generation.capabilityCatalog.source;
  const changes = [
    ...(catalogChanged
      ? [{
          relativePath: COMPOSITION_REVISION_PATH,
          before: beforeCompositionRevisionSource,
          after: afterCompositionRevisionSource,
        }]
      : []),
    {
      relativePath: APP_UI_MODEL_PATH,
      before: beforeModelSource,
      after: afterModelSource,
    },
    {
      relativePath: GENERATED_PLUGIN_REGISTRY_PATH,
      before: beforeRegistrySource,
      after: generation.capabilityCatalog.source,
    },
  ].filter((change) => change.before !== change.after);
  if (changes.length > 0) {
    await commitFiles(projectRoot, transactionId, changes, options);
  }

  const beforeCapabilityPluginIds = generatedCapabilityPluginIds(
    beforeRegistrySource,
  );
  const afterCapabilityPluginIds = generation.capabilityCatalog.pluginIds;
  const beforeCapabilityPluginSet = new Set(beforeCapabilityPluginIds);
  const afterCapabilityPluginSet = new Set(afterCapabilityPluginIds);
  return {
    schemaVersion: 1,
    transactionId,
    changed: changes.length > 0,
    changedPaths: changes.map((change) => change.relativePath).sort(),
    appUIModel: { beforeHash, afterHash },
    diff: {
      plugins: changedKeys(mapInstances(beforeModel), mapInstances(afterModel)),
      layoutNodes: changedKeys(
        mapLayoutNodes(beforeModel.root),
        mapLayoutNodes(afterModel.root),
      ),
      slots: changedKeys(mapSlots(beforeModel), mapSlots(afterModel)),
      capabilityCatalog: {
        changed: catalogChanged,
        addedPluginIds: catalogChanged
          ? afterCapabilityPluginIds
              .filter((pluginId) => !beforeCapabilityPluginSet.has(pluginId))
              .sort()
          : [],
        removedPluginIds: catalogChanged
          ? beforeCapabilityPluginIds
              .filter((pluginId) => !afterCapabilityPluginSet.has(pluginId))
              .sort()
          : [],
      },
    },
    activeComposition: {
      selectedPluginIds: generation.activeComposition.selectedPluginIds,
      resolvedPluginIds: generation.activeComposition.resolvedPluginIds,
      headlessPluginIds: generation.activeComposition.headlessPluginIds,
    },
    warnings,
    snapshotToken: {
      appUIModelHash: afterHash,
      capabilityCatalogSourceHash: hash(generation.capabilityCatalog.source),
      capabilityCatalogRevision: generation.capabilityCatalog.revision,
    },
    ...(semanticComposition === undefined ? {} : { semanticComposition }),
    ...(catalogChanged ? { compositionRevision } : {}),
  };
}

export async function mutateAppUIModel(
  projectRoot: string,
  rawInput: unknown,
  options: AppUITransactionTestOptions = {},
): Promise<AppUITransactionResult> {
  const input = appUITransactionInputSchema.parse(rawInput);
  return withProjectLock(projectRoot, () =>
    runTransaction(path.resolve(projectRoot), input, options),
  );
}
