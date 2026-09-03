import { SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import type { CreateDeepAgentParams } from "deepagents";

import type { CreatorActivityRecorder } from "../CreatorActivityRecorder.js";
import type { ProjectControlAdapter } from "./ProjectControlAdapter.js";
import { createAppUIModelTool } from "./appUIModelTool.js";
import { createCreatorUndoTool } from "../transactions/creatorUndoTool.js";
import {
  formatProjectSnapshotForPrompt,
  loadProjectSnapshot,
} from "./projectSnapshot.js";
import type { CreatorRuntimeDiagnosticSession } from "../runtime-diagnostics/CreatorRuntimeDiagnosticStore.js";
import { createRuntimeDiagnosticTool } from "../runtime-diagnostics/runtimeDiagnosticTool.js";

export const MAX_CREATOR_PROJECT_TOOL_RESULT_CHARACTERS = 48_000;

type CreatorMiddleware = NonNullable<
  CreateDeepAgentParams["middleware"]
>[number];

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
          : "PROJECT_INSPECTION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    },
  });
}

function boundedResult(result: unknown): string {
  const serialized = JSON.stringify({ ok: true, result });
  if (serialized.length <= MAX_CREATOR_PROJECT_TOOL_RESULT_CHARACTERS) {
    return serialized;
  }
  return JSON.stringify({
    ok: false,
    error: {
      code: "PROJECT_INSPECTION_RESULT_TOO_LARGE",
      message: `Inspection result exceeds ${MAX_CREATOR_PROJECT_TOOL_RESULT_CHARACTERS} characters. Use a narrower inspect tool or read the project file in sections.`,
    },
  });
}

async function toolRequest(
  operation: Parameters<ProjectControlAdapter["request"]>[0],
  adapter: ProjectControlAdapter,
  input: Record<string, unknown> = {},
): Promise<string> {
  try {
    return boundedResult(await adapter.request(operation, input));
  } catch (error) {
    return errorResult(error);
  }
}

export function createCreatorProjectTools(
  adapter: ProjectControlAdapter,
  activity?: CreatorActivityRecorder | undefined,
  runtimeDiagnostics?: CreatorRuntimeDiagnosticSession | undefined,
) {
  const inspectProjectTool = tool(
    async () =>
      boundedResult(
        await loadProjectSnapshot(adapter, activity, runtimeDiagnostics),
      ),
    {
      name: "inspect_ui_project",
      description:
        "Inspect the bounded target UI project snapshot: AppUIModel hash, layout and Slot paths, PluginInstances, mounts, Registry freshness, plugin assets, catalogs, UI stack, and current Creator validation metadata.",
      schema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  );
  const inspectAppUIModelTool = tool(
    async () => toolRequest("inspect_app_ui_model", adapter),
    {
      name: "inspect_app_ui_model",
      description:
        "Read the exact validated AppUIModel source, parsed model, and SHA-256 hash through the target project's fixed control entry.",
      schema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  );
  const inspectUISlotsTool = tool(
    async (input: { root?: string }) =>
      toolRequest("inspect_ui_slots", adapter, input),
    {
      name: "inspect_ui_slots",
      description:
        "Inspect Layout Slot locations and configured PluginInstance mounts. Provide an exact Slot id to inspect its configured mounts and stable order. This is static configuration, not live SlotRegistry contribution state.",
      schema: {
        type: "object",
        properties: {
          root: { type: "string", minLength: 1, maxLength: 200 },
        },
        additionalProperties: false,
      },
    },
  );
  const listUIPluginsTool = tool(
    async () => toolRequest("list_ui_plugins", adapter),
    {
      name: "list_ui_plugins",
      description:
        "List target UI plugin assets, instances, selection state, Registry state, and development catalogs without reading plugin source.",
      schema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  );
  const inspectUIPluginTool = tool(
    async (input: { pluginId: string }) =>
      toolRequest("inspect_ui_plugin", adapter, input),
    {
      name: "inspect_ui_plugin",
      description:
        "Inspect one UI plugin by exact pluginId, including manifest, instances, bounded definition source, and its file inventory.",
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
  const mutateAppUIModelTool = createAppUIModelTool(adapter, activity);
  const projectTools = [
    inspectProjectTool,
    inspectAppUIModelTool,
    inspectUISlotsTool,
    listUIPluginsTool,
    inspectUIPluginTool,
    mutateAppUIModelTool,
    ...(runtimeDiagnostics === undefined
      ? []
      : [createRuntimeDiagnosticTool(adapter, runtimeDiagnostics)]),
  ];
  return activity === undefined
    ? projectTools
    : [...projectTools, createCreatorUndoTool(activity)];
}

export function createCreatorProjectControlMiddleware(
  adapter: ProjectControlAdapter,
  activity?: CreatorActivityRecorder | undefined,
  runtimeDiagnostics?: CreatorRuntimeDiagnosticSession | undefined,
): CreatorMiddleware {
  let observedRunId: string | undefined;
  let snapshotPrompt: string | undefined;

  return {
    name: "creator-project-control",
    tools: createCreatorProjectTools(adapter, activity, runtimeDiagnostics),
    async wrapModelCall(request, handler) {
      const runId = activity?.runId ?? "unavailable";
      if (snapshotPrompt === undefined || observedRunId !== runId) {
        observedRunId = runId;
        snapshotPrompt = formatProjectSnapshotForPrompt(
          await loadProjectSnapshot(adapter, activity, runtimeDiagnostics),
        );
      }

      if (typeof request.systemPrompt === "string") {
        return handler({
          ...request,
          systemPrompt: `${request.systemPrompt}\n\n${snapshotPrompt}`,
        });
      }
      if (request.systemMessage !== undefined) {
        return handler({
          ...request,
          systemMessage: new SystemMessage(
            `${request.systemMessage.text}\n\n${snapshotPrompt}`,
          ),
        });
      }
      return handler({ ...request, systemPrompt: snapshotPrompt });
    },
  };
}
