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
  type AppUIModel,
  type LayoutNode,
} from "../../framework/contracts/app-ui-model";
import {
  appUIOperationsSchema,
  applyAppUIOperations,
  buildLayoutNodeIndex,
  type AppUIOperation,
} from "./app-ui-operations";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
} from "./registry-generator";
import type { ProjectIssue } from "./types";

const APP_UI_MODEL_PATH = "app-ui/app-ui.json";
const TRANSACTION_DIRECTORY_PATH = ".agentuicreator/control";
const TRANSACTION_JOURNAL_PATH = `${TRANSACTION_DIRECTORY_PATH}/pending-app-ui-transaction.json`;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const appUITransactionInputSchema = z.strictObject({
  appUIModelHash: z.string().regex(SHA256_PATTERN),
  operations: appUIOperationsSchema,
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
    instances: {
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
    registry: {
      changed: boolean;
      addedPluginIds: string[];
      removedPluginIds: string[];
    };
  };
  registry: {
    selectedPluginIds: string[];
    registeredPluginIds: string[];
  };
  warnings: ProjectIssue[];
  snapshotToken: {
    appUIModelHash: string;
    registryHash: string;
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
          GENERATED_PLUGIN_REGISTRY_PATH,
        ]),
        temporaryPath: z.string().min(1),
        before: stateSchema,
        after: stateSchema,
      }),
    ).min(1).max(2),
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

function selectedPluginIds(model: AppUIModel): string[] {
  return [...new Set(Object.values(model.pluginInstances).map((item) => item.pluginId))]
    .sort();
}

function validateMountSemantics(model: AppUIModel): ProjectIssue[] {
  // An enabled instance without mount is valid but contributes no ordinary UI.
  return Object.values(model.pluginInstances)
    .filter((instance) => !instance.enabled && instance.mount !== undefined)
    .map((instance) => ({
      code: "disabled-instance-mounted",
      message: `Disabled PluginInstance "${instance.id}" has a mount target but will not render.`,
    }));
}

function mapInstances(model: AppUIModel): Map<string, string> {
  return new Map(
    Object.entries(model.pluginInstances).map(([id, instance]) => [
      id,
      JSON.stringify(instance),
    ]),
  );
}

function mapLayoutNodes(root: LayoutNode): Map<string, string> {
  return new Map(
    [...buildLayoutNodeIndex(root).values()].map(({ node }) => [
      node.id,
      JSON.stringify(node),
    ]),
  );
}

function mapSlots(model: AppUIModel): Map<string, string> {
  return new Map(
    [...buildLayoutNodeIndex(model.root).values()]
      .filter(({ node }) => node.type === "slot")
      .map(({ node }) => [(node as import("../../framework/contracts/app-ui-model").SlotNode).slotId, JSON.stringify(node)]),
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
  try {
    beforeModel = parseAppUIModelJson(beforeModelSource);
    afterModel = parseAppUIModel(
      applyAppUIOperations(beforeModel, input.operations as AppUIOperation[]),
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

  const registry = await generatePluginRegistry(projectRoot, afterModel);
  if (registry.errors.length > 0) {
    throw new AppUITransactionError(
      "PLUGIN_REGISTRY_GENERATION_FAILED",
      "The transaction cannot resolve a complete static Plugin Registry.",
      { issues: registry.errors },
    );
  }
  const warnings = validateMountSemantics(afterModel);
  const afterModelSource = semanticModelSource(
    beforeModel,
    beforeModelSource,
    afterModel,
  );
  const beforeRegistrySource = await readOptional(registryPath);
  const changes = [
    {
      relativePath: APP_UI_MODEL_PATH,
      before: beforeModelSource,
      after: afterModelSource,
    },
    {
      relativePath: GENERATED_PLUGIN_REGISTRY_PATH,
      before: beforeRegistrySource,
      after: registry.source,
    },
  ].filter((change) => change.before !== change.after);
  const transactionId = randomUUID();
  if (changes.length > 0) {
    await commitFiles(projectRoot, transactionId, changes, options);
  }

  const beforePluginIds = selectedPluginIds(beforeModel);
  const afterPluginIds = selectedPluginIds(afterModel);
  const beforePluginSet = new Set(beforePluginIds);
  const afterPluginSet = new Set(afterPluginIds);
  const afterHash = hash(afterModelSource);

  return {
    schemaVersion: 1,
    transactionId,
    changed: changes.length > 0,
    changedPaths: changes.map((change) => change.relativePath).sort(),
    appUIModel: { beforeHash, afterHash },
    diff: {
      instances: changedKeys(mapInstances(beforeModel), mapInstances(afterModel)),
      layoutNodes: changedKeys(
        mapLayoutNodes(beforeModel.root),
        mapLayoutNodes(afterModel.root),
      ),
      slots: changedKeys(mapSlots(beforeModel), mapSlots(afterModel)),
      registry: {
        changed: beforeRegistrySource !== registry.source,
        addedPluginIds: afterPluginIds
          .filter((pluginId) => !beforePluginSet.has(pluginId))
          .sort(),
        removedPluginIds: beforePluginIds
          .filter((pluginId) => !afterPluginSet.has(pluginId))
          .sort(),
      },
    },
    registry: {
      selectedPluginIds: registry.selectedPluginIds,
      registeredPluginIds: registry.registeredPluginIds,
    },
    warnings,
    snapshotToken: {
      appUIModelHash: afterHash,
      registryHash: hash(registry.source),
    },
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
