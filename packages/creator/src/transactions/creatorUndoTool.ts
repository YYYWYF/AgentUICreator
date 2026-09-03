import { tool } from "@langchain/core/tools";

import type { CreatorActivityRecorder } from "../CreatorActivityRecorder.js";
import { ProjectCommandBackend } from "../ProjectCreatorBackend.js";

const UNDO_VALIDATION_COMMANDS = ["pnpm verify:ui", "pnpm typecheck"] as const;
const MAX_UNDO_TOOL_RESULT_CHARACTERS = 24_000;

export interface CreatorUndoToolInput {
  runId?: string | undefined;
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
          : "CREATOR_UNDO_FAILED",
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

export async function executeCreatorUndo(
  activity: CreatorActivityRecorder,
  commands: ProjectCommandBackend,
  input: CreatorUndoToolInput,
): Promise<string> {
  try {
    const record =
      input.runId === undefined
        ? await activity.transactions.latestUndoable(activity.runId)
        : await activity.transactions.load(input.runId);
    const status = await activity.transactions.status(record.runId);
    if (!status.undoable) {
      const error = new Error(
        `Creator run "${record.runId}" cannot be undone because project files changed afterward.`,
      ) as Error & { code: string; details: unknown };
      error.code = "CREATOR_UNDO_CONFLICT";
      error.details = { conflicts: status.conflicts };
      throw error;
    }

    await Promise.all(
      record.files.map((file) => activity.captureBefore(file.path)),
    );
    const undo = await activity.transactions.undo(record.runId);
    for (const filePath of undo.changedPaths) {
      await activity.fileObservations.observe(filePath);
      activity.touch(filePath);
    }

    const validations = [];
    for (const command of UNDO_VALIDATION_COMMANDS) {
      const result = await commands.execute(command);
      validations.push({
        command,
        status: result.exitCode === 0 ? "passed" : "failed",
        exitCode: result.exitCode,
        output: result.output,
      });
    }
    const serialized = JSON.stringify({
      ok: true,
      result: {
        undoneRunId: undo.runId,
        changedPaths: undo.changedPaths,
        mutationRevision: activity.revision,
        validations,
      },
    });
    if (serialized.length > MAX_UNDO_TOOL_RESULT_CHARACTERS) {
      return JSON.stringify({
        ok: true,
        result: {
          undoneRunId: undo.runId,
          changedPaths: undo.changedPaths,
          mutationRevision: activity.revision,
          validations: validations.map((validation) => ({
            command: validation.command,
            status: validation.status,
            exitCode: validation.exitCode,
          })),
          outputTruncated: true,
        },
      });
    }
    return serialized;
  } catch (error) {
    return errorResult(error);
  }
}

export function createCreatorUndoTool(activity: CreatorActivityRecorder) {
  const commands = new ProjectCommandBackend({
    projectRoot: activity.projectRootPath,
    activity,
  });
  return tool(
    async (input: CreatorUndoToolInput) =>
      executeCreatorUndo(activity, commands, input),
    {
      name: "undo_creator_run",
      description:
        "Safely undo one completed Creator run. Every affected file must still match that run's recorded after hash; otherwise the entire undo is rejected with zero writes. Omit runId to undo the latest still-undoable run. After restoring files, the Harness runs verify:ui and typecheck automatically.",
      schema: {
        type: "object",
        properties: {
          runId: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            description:
              "Completed Creator run id from a modification receipt. Omit for the latest undoable run.",
          },
        },
        additionalProperties: false,
      },
    },
  );
}
