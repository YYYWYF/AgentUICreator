import { SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import type { CreateDeepAgentParams } from "deepagents";

import type { CreatorActivityRecorder } from "../CreatorActivityRecorder.js";
import type { ProjectControlAdapter } from "./ProjectControlAdapter.js";
import { CreatorProjectPromptContext } from "./CreatorProjectPromptContext.js";
import { createAppUIModelTool } from "./appUIModelTool.js";
import { createCreatorUndoTool } from "../transactions/creatorUndoTool.js";
import { loadProjectSnapshot } from "./projectSnapshot.js";
import type { CreatorRuntimeDiagnosticSession } from "../runtime-diagnostics/CreatorRuntimeDiagnosticStore.js";
import { createRuntimeDiagnosticTool } from "../runtime-diagnostics/runtimeDiagnosticTool.js";
import { createRuntimeCompositionTool } from "../runtime-diagnostics/runtimeCompositionTool.js";

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
  onSuccess?: (result: unknown) => void,
): Promise<string> {
  try {
    const result = await adapter.request(operation, input);
    onSuccess?.(result);
    return boundedResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

export function createCreatorProjectTools(
  adapter: ProjectControlAdapter,
  activity?: CreatorActivityRecorder | undefined,
  runtimeDiagnostics?: CreatorRuntimeDiagnosticSession | undefined,
  promptContext?: CreatorProjectPromptContext | undefined,
) {
  const inspectProjectTool = tool(
    async () => {
      const snapshot = await loadProjectSnapshot(
        adapter,
        activity,
        runtimeDiagnostics,
      );
      promptContext?.observeSnapshot(snapshot);
      return boundedResult(snapshot);
    },
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
    async () =>
      toolRequest("inspect_app_ui_model", adapter, {}, () => {
        promptContext?.invalidate("explicit_exact_inspection");
      }),
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
  const mutateAppUIModelTool = createAppUIModelTool(adapter, activity, {
    onStateInvalidated(reason) {
      if (reason === "hash_conflict") {
        promptContext?.invalidate("app_ui_model_hash_conflict");
      }
    },
  });
  const projectTools = [
    inspectProjectTool,
    inspectAppUIModelTool,
    inspectUISlotsTool,
    listUIPluginsTool,
    inspectUIPluginTool,
    mutateAppUIModelTool,
    ...(runtimeDiagnostics === undefined
      ? []
      : [
          createRuntimeDiagnosticTool(adapter, runtimeDiagnostics),
          createRuntimeCompositionTool(adapter, runtimeDiagnostics),
        ]),
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
  const promptContext = new CreatorProjectPromptContext(
    adapter,
    activity,
    runtimeDiagnostics,
  );

  return {
    name: "creator-project-control",
    tools: createCreatorProjectTools(
      adapter,
      activity,
      runtimeDiagnostics,
      promptContext,
    ),
    async wrapModelCall(request, handler) {
      const context = await promptContext.current();
      const prompt = `${context.navigationPrompt}\n\n${context.currentStatePrompt}`;

      if (typeof request.systemPrompt === "string") {
        return handler({
          ...request,
          systemPrompt: `${request.systemPrompt}\n\n${prompt}`,
        });
      }
      if (request.systemMessage !== undefined) {
        return handler({
          ...request,
          systemMessage: new SystemMessage(
            `${request.systemMessage.text}\n\n${prompt}`,
          ),
        });
      }
      return handler({ ...request, systemPrompt: prompt });
    },
  };
}
