import { lstat, readdir, realpath, rmdir } from "node:fs/promises";
import path from "node:path";

import { tool } from "@langchain/core/tools";

import type { CreatorActivityRecorder } from "../CreatorActivityRecorder.js";
import { ProjectCommandBackend } from "../ProjectCreatorBackend.js";
import {
  createCreatorFileAtomically,
  creatorContentHash,
  readCreatorFileState,
  removeCreatorFile,
  resolveCreatorProjectFile,
  type CreatorFileState,
} from "../files/creatorFileState.js";
import type { ProjectControlAdapter } from "./ProjectControlAdapter.js";
import {
  parsePluginSourceReferenceInspection,
  parseUIProjectInspection,
} from "./types.js";

export const CREATOR_PLUGIN_SOURCE_DELETE_ENABLED_BY_DEFAULT = false;
const DELETE_VALIDATION_COMMANDS = ["pnpm verify:ui", "pnpm typecheck"] as const;
const MAX_DELETE_RESULT_CHARACTERS = 24_000;

export interface DeleteUIPluginSourceInput {
  pluginId: string;
}

export interface CreatorPluginSourceDeleteAuthorization {
  runId: string;
  pluginId: string;
  source: "explicit-user-request" | "confirmed-user-answer";
}

export type CreatorPluginSourceDeleteAuthorizationProvider = (
  input: DeleteUIPluginSourceInput,
) =>
  | CreatorPluginSourceDeleteAuthorization
  | undefined
  | Promise<CreatorPluginSourceDeleteAuthorization | undefined>;

interface DeletablePluginFile {
  path: string;
  state: CreatorFileState & { exists: true; content: string };
}

class DeleteUIPluginSourceError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "DeleteUIPluginSourceError";
    this.code = code;
    this.details = details;
  }
}

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function errorResult(error: unknown): string {
  return JSON.stringify({
    ok: false,
    error: {
      code:
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "CREATOR_PLUGIN_DELETE_FAILED",
      message: error instanceof Error ? error.message : String(error),
      ...(typeof error === "object" &&
      error !== null &&
      "details" in error &&
      error.details !== undefined
        ? { details: error.details }
        : {}),
    },
  });
}

function assertAuthorization(
  activity: CreatorActivityRecorder,
  input: DeleteUIPluginSourceInput,
  authorization: CreatorPluginSourceDeleteAuthorization | undefined,
): void {
  if (
    authorization === undefined ||
    authorization.runId !== activity.runId ||
    authorization.pluginId !== input.pluginId ||
    (authorization.source !== "explicit-user-request" &&
      authorization.source !== "confirmed-user-answer")
  ) {
    throw new DeleteUIPluginSourceError(
      "CREATOR_PLUGIN_DELETE_UNAUTHORIZED",
      `Deleting UI plugin source for "${input.pluginId}" requires trusted authorization for this exact Creator run and plugin id.`,
    );
  }
}

function assertOneDirectory(directory: string): void {
  if (
    directory === "" ||
    directory === "." ||
    directory === ".." ||
    path.basename(directory) !== directory ||
    directory.includes("/") ||
    directory.includes("\\")
  ) {
    throw new DeleteUIPluginSourceError(
      "CREATOR_PLUGIN_DELETE_PATH_INVALID",
      `Refusing to delete invalid UI plugin directory "${directory}".`,
    );
  }
}

async function collectDeletablePluginFiles(
  projectRoot: string,
  directory: string,
): Promise<{ files: DeletablePluginFile[]; directories: string[] }> {
  assertOneDirectory(directory);
  const pluginRootLocation = resolveCreatorProjectFile(
    projectRoot,
    `plugins/${directory}`,
  );
  const rootInfo = await lstat(pluginRootLocation.absolutePath);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new DeleteUIPluginSourceError(
      "CREATOR_PLUGIN_DELETE_PATH_INVALID",
      `plugins/${directory} must be a real directory, not a link or special file.`,
    );
  }
  const [realRoot, realPluginRoot] = await Promise.all([
    realpath(projectRoot),
    realpath(pluginRootLocation.absolutePath),
  ]);
  if (!isWithin(realRoot, realPluginRoot)) {
    throw new DeleteUIPluginSourceError(
      "CREATOR_PLUGIN_DELETE_PATH_INVALID",
      `plugins/${directory} resolves outside the target project.`,
    );
  }

  const files: DeletablePluginFile[] = [];
  const directories: string[] = [];
  const visit = async (relativeDirectory: string): Promise<void> => {
    const location = resolveCreatorProjectFile(projectRoot, relativeDirectory);
    directories.push(location.receiptPath);
    const entries = (await readdir(location.absolutePath, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = `${location.receiptPath}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(relativePath);
        continue;
      }
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new DeleteUIPluginSourceError(
          "CREATOR_PLUGIN_DELETE_UNSUPPORTED_ENTRY",
          `Refusing to delete unsupported plugin entry ${relativePath}.`,
        );
      }
      const state = await readCreatorFileState(projectRoot, relativePath);
      if (!state.exists || state.content === undefined) {
        throw new DeleteUIPluginSourceError(
          "CREATOR_PLUGIN_DELETE_STALE",
          `${relativePath} disappeared during delete preflight.`,
        );
      }
      if (creatorContentHash(state.content) !== state.hash) {
        throw new DeleteUIPluginSourceError(
          "CREATOR_PLUGIN_DELETE_BINARY_UNSUPPORTED",
          `${relativePath} is not losslessly representable as UTF-8 text, so the current transaction journal cannot safely restore it.`,
        );
      }
      files.push({
        path: relativePath,
        state: { ...state, exists: true, content: state.content },
      });
    }
  };
  await visit(`plugins/${directory}`);
  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    directories: directories.sort(
      (left, right) => right.split("/").length - left.split("/").length,
    ),
  };
}

async function restoreDeletedFiles(
  projectRoot: string,
  deleted: DeletablePluginFile[],
): Promise<void> {
  for (const file of [...deleted].reverse()) {
    await createCreatorFileAtomically(
      projectRoot,
      file.path,
      file.state.content,
    );
  }
}

async function executeDeleteUIPluginSourceUnlocked(
  adapter: ProjectControlAdapter,
  activity: CreatorActivityRecorder,
  commands: ProjectCommandBackend,
  input: DeleteUIPluginSourceInput,
  authorization?: CreatorPluginSourceDeleteAuthorization | undefined,
): Promise<string> {
  try {
    const pluginId = input.pluginId.trim();
    if (pluginId === "" || pluginId !== input.pluginId || pluginId.length > 200) {
      throw new DeleteUIPluginSourceError(
        "CREATOR_PLUGIN_DELETE_INPUT_INVALID",
        "pluginId must be a non-empty trimmed string of at most 200 characters.",
      );
    }
    assertAuthorization(activity, input, authorization);
    const inspection = parseUIProjectInspection(
      await adapter.request("inspect_ui_project"),
    );
    const assets = inspection.pluginAssets.filter(
      (asset) => asset.pluginId === pluginId,
    );
    if (assets.length !== 1 || assets[0] === undefined) {
      throw new DeleteUIPluginSourceError(
        assets.length === 0
          ? "CREATOR_PLUGIN_DELETE_NOT_FOUND"
          : "CREATOR_PLUGIN_DELETE_AMBIGUOUS",
        assets.length === 0
          ? `No UI plugin source asset declares "${pluginId}".`
          : `Multiple UI plugin source assets declare "${pluginId}".`,
      );
    }
    const asset = assets[0];
    const instances = inspection.pluginInstances.filter(
      (instance) => instance.pluginId === pluginId,
    );
    if (instances.length > 0) {
      throw new DeleteUIPluginSourceError(
        "CREATOR_PLUGIN_DELETE_MODEL_REFERENCE",
        `UI plugin "${pluginId}" still has AppUIModel instances. Remove the instances first while keeping source intact.`,
        { instanceIds: instances.map((instance) => instance.id) },
      );
    }
    if (
      !inspection.registry.generatedFileFresh ||
      inspection.registry.issues.length > 0 ||
      inspection.registry.selectedPluginIds.includes(pluginId) ||
      inspection.registry.registeredPluginIds.includes(pluginId)
    ) {
      throw new DeleteUIPluginSourceError(
        "CREATOR_PLUGIN_DELETE_REGISTRY_UNSAFE",
        `The production Registry is not a fresh, reference-free derivation for "${pluginId}".`,
        { registry: inspection.registry },
      );
    }
    const references = parsePluginSourceReferenceInspection(
      await adapter.request("inspect_ui_plugin_source_references", {
        pluginId,
      }),
    );
    if (
      references.pluginId !== pluginId ||
      references.directory !== asset.directory
    ) {
      throw new DeleteUIPluginSourceError(
        "CREATOR_PLUGIN_DELETE_REFERENCE_RESULT_INVALID",
        "The target project returned reference analysis for a different plugin asset.",
      );
    }
    if (references.references.length > 0 || references.truncated) {
      throw new DeleteUIPluginSourceError(
        "CREATOR_PLUGIN_DELETE_SOURCE_REFERENCE",
        `UI plugin "${pluginId}" is still referenced by project source.`,
        {
          references: references.references,
          truncated: references.truncated,
        },
      );
    }

    const deletion = await collectDeletablePluginFiles(
      activity.projectRootPath,
      asset.directory,
    );
    for (const file of deletion.files) {
      activity.captureBeforeContent(file.path, file.state.content);
    }
    const deleted: DeletablePluginFile[] = [];
    try {
      for (const file of deletion.files) {
        await removeCreatorFile(
          activity.projectRootPath,
          file.path,
          file.state,
        );
        deleted.push(file);
      }
      for (const directory of deletion.directories) {
        await rmdir(
          resolveCreatorProjectFile(activity.projectRootPath, directory)
            .absolutePath,
        );
      }
    } catch (error) {
      try {
        await restoreDeletedFiles(activity.projectRootPath, deleted);
      } catch (rollbackError) {
        throw new DeleteUIPluginSourceError(
          "CREATOR_PLUGIN_DELETE_ROLLBACK_FAILED",
          `Deleting UI plugin "${pluginId}" failed and rollback was incomplete.`,
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
    for (const file of deletion.files) {
      await activity.fileObservations.observe(file.path);
      activity.touch(file.path);
    }

    const validations = [];
    for (const command of DELETE_VALIDATION_COMMANDS) {
      const result = await commands.execute(command);
      validations.push({
        command,
        status: result.exitCode === 0 ? "passed" : "failed",
        exitCode: result.exitCode,
        output: result.output,
      });
    }
    const failed = validations.filter(
      (validation) => validation.status === "failed",
    );
    const result = {
      deletedPluginId: pluginId,
      deletedDirectory: `plugins/${asset.directory}`,
      changedPaths: deletion.files.map((file) => file.path),
      mutationRevision: activity.revision,
      validations,
    };
    if (failed.length > 0) {
      return JSON.stringify({
        ok: false,
        error: {
          code: "CREATOR_PLUGIN_DELETE_VALIDATION_FAILED",
          message: `UI plugin "${pluginId}" source was deleted, but required validation failed. Repair the project or undo this run before reporting success.`,
          details: result,
        },
      });
    }
    const serialized = JSON.stringify({ ok: true, result });
    return serialized.length <= MAX_DELETE_RESULT_CHARACTERS
      ? serialized
      : JSON.stringify({
          ok: true,
          result: {
            deletedPluginId: pluginId,
            deletedDirectory: `plugins/${asset.directory}`,
            changedFileCount: deletion.files.length,
            mutationRevision: activity.revision,
            validations: validations.map(({ command, status, exitCode }) => ({
              command,
              status,
              exitCode,
            })),
            outputTruncated: true,
          },
        });
  } catch (error) {
    return errorResult(error);
  }
}

export async function executeDeleteUIPluginSource(
  adapter: ProjectControlAdapter,
  activity: CreatorActivityRecorder,
  commands: ProjectCommandBackend,
  input: DeleteUIPluginSourceInput,
  authorization?: CreatorPluginSourceDeleteAuthorization | undefined,
): Promise<string> {
  return adapter.withMutationLock(() =>
    executeDeleteUIPluginSourceUnlocked(
      adapter,
      activity,
      commands,
      input,
      authorization,
    ),
  );
}

export function createDeleteUIPluginSourceTool(
  adapter: ProjectControlAdapter,
  activity: CreatorActivityRecorder,
  authorizationProvider: CreatorPluginSourceDeleteAuthorizationProvider,
) {
  const commands = new ProjectCommandBackend({
    projectRoot: activity.projectRootPath,
    activity,
  });
  return tool(
    async (input: DeleteUIPluginSourceInput) =>
      executeDeleteUIPluginSource(
        adapter,
        activity,
        commands,
        input,
        await authorizationProvider(input),
      ),
    {
      name: "delete_ui_plugin_source",
      description:
        "Permanently delete one unreferenced plugins/<directory> source asset only after the host has authorized this exact run and plugin id. Ordinary hide, remove, and replace requests must not call this tool.",
      schema: {
        type: "object",
        properties: {
          pluginId: { type: "string", minLength: 1, maxLength: 200 },
        },
        required: ["pluginId"],
        additionalProperties: false,
      },
    },
  );
}
