import { tool } from "@langchain/core/tools";

import type { ProjectControlAdapter } from "../project-control/ProjectControlAdapter.js";
import { parseUIProjectInspection } from "../project-control/types.js";
import type { CreatorRuntimeDiagnosticSession } from "./CreatorRuntimeDiagnosticStore.js";

const MAX_TOOL_ERROR_MESSAGE_CHARACTERS = 1_000;
const MAX_TOOL_COMPONENT_STACK_CHARACTERS = 1_200;

function truncate(value: string | undefined, maximum: number): string | undefined {
  if (value === undefined || value.length <= maximum) {
    return value;
  }
  return `${value.slice(0, maximum)}…`;
}

export function createRuntimeDiagnosticTool(
  adapter: ProjectControlAdapter,
  diagnostics: CreatorRuntimeDiagnosticSession,
) {
  return tool(
    async (input: { includeStale?: boolean | undefined }) => {
      try {
        const project = parseUIProjectInspection(
          await adapter.request("inspect_ui_project"),
        );
        const inspection = diagnostics.inspect(project.appUIModel.hash, {
          includeStale: input.includeStale === true,
        });
        const compact = (record: (typeof inspection.currentErrors)[number]) => ({
          ...record,
          ...(record.errorMessage === undefined
            ? {}
            : {
                errorMessage: truncate(
                  record.errorMessage,
                  MAX_TOOL_ERROR_MESSAGE_CHARACTERS,
                ),
              }),
          ...(record.componentStack === undefined
            ? {}
            : {
                componentStack: truncate(
                  record.componentStack,
                  MAX_TOOL_COMPONENT_STACK_CHARACTERS,
                ),
              }),
        });
        return JSON.stringify({
          ok: true,
          result: {
            ...inspection,
            currentErrors: inspection.currentErrors.map(compact),
            resolvedCurrent: inspection.resolvedCurrent.map(compact),
            stale: inspection.stale.map(compact),
          },
        });
      } catch (error) {
        return JSON.stringify({
          ok: false,
          error: {
            code: "RUNTIME_DIAGNOSTIC_INSPECTION_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    },
    {
      name: "inspect_runtime_errors",
      description:
        "Inspect bounded, source-attributed plugin render and activation diagnostics for the current AppUIModel hash. Set includeStale only when historical diagnostics from older hashes are needed.",
      schema: {
        type: "object",
        properties: {
          includeStale: {
            type: "boolean",
            description:
              "Include resolved/stale audit history from older AppUIModel hashes.",
          },
        },
        additionalProperties: false,
      },
    },
  );
}
