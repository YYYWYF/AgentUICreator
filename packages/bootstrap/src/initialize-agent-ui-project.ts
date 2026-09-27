import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { agentUIModeRegistry, type AgentUIMode } from "./project-definition.js";
import { createDefaultAgentUIPresetRegistry } from "./default-presets.js";
import { validateAgentUIProjectSetup } from "./source-root.js";

export interface AgentUIProjectConfigV2 {
  readonly version: "2";
  readonly mode: AgentUIMode;
  readonly sourceRoot: string;
}

export interface InitializeAgentUIProjectInput {
  readonly projectRoot: string;
  readonly mode: AgentUIMode;
  readonly sourceRoot: string;
}

export interface InitializeAgentUIProjectResult {
  readonly projectConfig: AgentUIProjectConfigV2;
  readonly presetId: string;
  readonly createdPaths: readonly string[];
  readonly installedSourceItems: readonly string[];
}

export interface AgentUIInitializationHost<TModel> {
  inspectProject(projectRoot: string): Promise<{ status: string }>;
  parseAppUIModel(input: unknown): TModel;
  /** Resolve all Source Registry requirements and package dependencies before mutation. */
  preflightSources(projectRoot: string, itemIds: readonly string[], config: AgentUIProjectConfigV2): Promise<{
    readonly plannedPaths: readonly string[];
  }>;
  installSources(projectRoot: string, itemIds: readonly string[], config: AgentUIProjectConfigV2): Promise<{
    readonly installedSourceItems: readonly string[];
    readonly createdPaths: readonly string[];
  }>;
  writeAppUIModel(projectRoot: string, model: TModel, config: AgentUIProjectConfigV2): Promise<string>;
  writeGeneratedRuntimeConfig(projectRoot: string, config: AgentUIProjectConfigV2): Promise<string>;
  writeGeneratedRegistry(projectRoot: string, config: AgentUIProjectConfigV2): Promise<string>;
  verifyProject(projectRoot: string, config: AgentUIProjectConfigV2): Promise<{ status: "passed" | "failed"; errors: readonly { code: string; message: string }[] }>;
  rollbackCreatedPaths(projectRoot: string, paths: readonly string[], config: AgentUIProjectConfigV2, plannedPaths: readonly string[], sourceRootWasMissing: boolean): Promise<void>;
  /** Install the development control plane before committing project.json. */
  installControlPlane(projectRoot: string): Promise<readonly string[]>;
  /** Optional persistence seam for failure-path tests. */
  writeInitializationJournal?(filePath: string, journal: AgentUIInitializationJournal, create: boolean): Promise<void>;
}

export class AgentUIInitializationError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = "AgentUIInitializationError";
  }
}

interface AgentUIInitializationJournal {
  readonly version: 1;
  readonly transactionId: string;
  readonly mode: AgentUIMode;
  readonly sourceRoot: string;
  readonly plannedPaths: readonly string[];
  readonly createdPaths: readonly string[];
  readonly phase: "preparing" | "sources-installed" | "model-written" | "verified" | "committed" | "postcondition-failed";
  readonly failure?: { readonly code: string; readonly message: string };
}

async function writeJournal(filePath: string, journal: AgentUIInitializationJournal, create = false): Promise<void> {
  const content = `${JSON.stringify(journal, null, 2)}\n`;
  if (create) {
    await writeFile(filePath, content, { flag: "wx" });
    return;
  }
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { flag: "wx" });
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try { await lstat(filePath); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Host bootstrap transaction. Generated-project parsing and verification stay in the Host adapter. */
export async function initializeAgentUIProject<TModel>(
  input: InitializeAgentUIProjectInput,
  host: AgentUIInitializationHost<TModel>,
): Promise<InitializeAgentUIProjectResult> {
  const projectRoot = path.resolve(input.projectRoot);
  const initial = await host.inspectProject(projectRoot);
  if (initial.status !== "uninitialized") {
    throw new AgentUIInitializationError(
      initial.status === "ready" || initial.status === "legacy"
        ? "AGENT_UI_PROJECT_ALREADY_INITIALIZED" : "AGENT_UI_PROJECT_INVALID_STATE",
      `Cannot initialize Agent UI from project status ${initial.status}.`,
    );
  }
  const setup = await validateAgentUIProjectSetup({ ...input, projectRoot });
  if (!setup.valid) {
    const issue = setup.issues[0]!;
    throw new AgentUIInitializationError(issue.code, issue.message, setup.issues);
  }
  const projectConfig: AgentUIProjectConfigV2 = {
    version: "2", mode: input.mode, sourceRoot: setup.sourceRoot.normalized,
  };
  const preset = createDefaultAgentUIPresetRegistry(host.parseAppUIModel)
    .getDefaultForMode(input.mode, agentUIModeRegistry);
  const model = preset.createAppUIModel();
  const itemIds = preset.sourceItems ?? [];
  const preflight = await host.preflightSources(projectRoot, itemIds, projectConfig);
  const metadataRoot = path.join(projectRoot, ".agent-ui");
  const metadataRootWasMissing = !(await pathExists(metadataRoot));
  const projectConfigPath = path.join(metadataRoot, "project.json");
  const journalPath = path.join(metadataRoot, "init-transaction.json");
  const persistJournal = host.writeInitializationJournal ?? writeJournal;
  const createdPaths = new Set<string>();
  let journalCreated = false;
  const journal: AgentUIInitializationJournal = {
    version: 1, transactionId: randomUUID(), mode: input.mode,
    sourceRoot: projectConfig.sourceRoot,
    plannedPaths: [...preflight.plannedPaths].sort(), createdPaths: [], phase: "preparing",
  };
  let installed: Awaited<ReturnType<typeof host.installSources>>;
  // Before project.json is created, this transaction may roll back its own files.
  // Once the create-only write succeeds, the project is committed; later failures
  // require recovery and must never trigger automatic rollback.
  try {
    await mkdir(metadataRoot, { recursive: true });
    await persistJournal(journalPath, journal, true);
    journalCreated = true;
    installed = await host.installSources(projectRoot, itemIds, projectConfig);
    for (const createdPath of installed.createdPaths) createdPaths.add(createdPath);
    await persistJournal(journalPath, { ...journal, createdPaths: [...createdPaths].sort(), phase: "sources-installed" }, false);
    createdPaths.add(await host.writeAppUIModel(projectRoot, model, projectConfig));
    try {
      createdPaths.add(await host.writeGeneratedRuntimeConfig(projectRoot, projectConfig));
      createdPaths.add(await host.writeGeneratedRegistry(projectRoot, projectConfig));
    } catch (error) {
      throw new AgentUIInitializationError(
        "AGENT_UI_INITIALIZATION_VERIFICATION_FAILED",
        "Could not generate the initial Agent UI runtime artifacts.", error,
      );
    }
    await persistJournal(journalPath, { ...journal, createdPaths: [...createdPaths].sort(), phase: "model-written" }, false);
    let verification: Awaited<ReturnType<typeof host.verifyProject>>;
    try {
      verification = await host.verifyProject(projectRoot, projectConfig);
    } catch (error) {
      throw new AgentUIInitializationError(
        "AGENT_UI_INITIALIZATION_VERIFICATION_FAILED",
        "Prospective Agent UI project static verification could not run.", error,
      );
    }
    if (verification.status !== "passed") {
      throw new AgentUIInitializationError(
        "AGENT_UI_INITIALIZATION_VERIFICATION_FAILED",
        "Prospective Agent UI project failed static verification.",
        verification.errors,
      );
    }
    for (const controlPath of await host.installControlPlane(projectRoot)) createdPaths.add(controlPath);
    await persistJournal(journalPath, { ...journal, createdPaths: [...createdPaths].sort(), phase: "verified" }, false);
    try {
      await writeFile(projectConfigPath, `${JSON.stringify(projectConfig, null, 2)}\n`, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new AgentUIInitializationError(
          "AGENT_UI_PROJECT_ALREADY_INITIALIZED",
          "project.json appeared before initialization could commit.", error,
        );
      }
      throw error;
    }
  } catch (error) {
    if (!journalCreated) throw error;
    try {
      await host.rollbackCreatedPaths(projectRoot, [...createdPaths], projectConfig, preflight.plannedPaths, setup.sourceRoot.targetState === "missing");
      await unlink(journalPath);
      if (metadataRootWasMissing) {
        await rmdir(metadataRoot).catch((cleanupError: NodeJS.ErrnoException) => {
          if (cleanupError.code !== "ENOENT" && cleanupError.code !== "ENOTEMPTY") throw cleanupError;
        });
      }
    } catch (rollbackError) {
      throw new AgentUIInitializationError(
        "AGENT_UI_INITIALIZATION_ROLLBACK_FAILED",
        "Agent UI initialization failed and rollback needs recovery.",
        { cause: error, rollbackCause: rollbackError },
      );
    }
    throw error;
  }

  // The project.json write above is the only commit point. Everything below is post-commit.
  try {
    await persistJournal(journalPath, { ...journal, createdPaths: [...createdPaths].sort(), phase: "committed" }, false);
    const finalState = await host.inspectProject(projectRoot);
    if (finalState.status !== "ready") {
      throw new AgentUIInitializationError(
        "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED",
        `Committed Agent UI project inspected as ${finalState.status}.`,
        { finalState },
      );
    }
    await unlink(journalPath);
    return {
      projectConfig, presetId: preset.id,
      createdPaths: [...createdPaths, path.relative(projectRoot, projectConfigPath).split(path.sep).join("/")].sort(),
      installedSourceItems: installed.installedSourceItems,
    };
  } catch (error) {
    const failure = error instanceof AgentUIInitializationError && error.code === "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED"
      ? error
      : new AgentUIInitializationError(
        "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED",
        "Committed Agent UI project could not complete postcondition inspection.", error,
      );
    try {
      await persistJournal(journalPath, {
        ...journal, createdPaths: [...createdPaths].sort(), phase: "postcondition-failed",
        failure: { code: failure.code, message: failure.message },
      }, false);
    } catch {
      // Keep the original postcondition failure if the diagnostic journal cannot be updated.
    }
    throw failure;
  }
}
