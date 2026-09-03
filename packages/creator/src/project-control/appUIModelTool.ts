import { tool } from "@langchain/core/tools";

import type { CreatorActivityRecorder } from "../CreatorActivityRecorder.js";
import type { ProjectControlAdapter } from "./ProjectControlAdapter.js";

const MAX_MUTATION_RESULT_CHARACTERS = 48_000;
const APP_UI_MODEL_PATH = "app-ui/app-ui.json";
const REGISTRY_PATH = "plugins/registry.generated.ts";
const MUTABLE_PATHS = new Set([APP_UI_MODEL_PATH, REGISTRY_PATH]);

const idSchema = { type: "string", minLength: 1, maxLength: 200 } as const;
const indexSchema = { type: "integer", minimum: 0 } as const;
const pluginInstanceSchema = {
  type: "object",
  properties: {
    id: idSchema,
    pluginId: idSchema,
    enabled: { type: "boolean" },
    props: { type: "object" },
  },
  required: ["id", "pluginId", "enabled"],
  additionalProperties: false,
} as const;
const layoutNodeSchema = {
  type: "object",
  description:
    "A complete AppUIModel LayoutNode (row, column, stack, panel, or slot), including its subtree.",
} as const;
const slotOwnerPropSchema = {
  type: "object",
  properties: {
    name: idSchema,
    type: idSchema,
    description: { type: "string", minLength: 1, maxLength: 2000 },
    required: { type: "boolean" },
  },
  required: ["name", "type", "description", "required"],
  additionalProperties: false,
} as const;
const slotOccupantSchema = {
  type: "object",
  properties: {
    instanceId: idSchema,
    id: idSchema,
    key: idSchema,
    order: { type: "number" },
  },
  required: ["instanceId"],
  additionalProperties: false,
} as const;
const uiSlotSchema = {
  type: "object",
  properties: {
    id: idSchema,
    kind: { type: "string", enum: ["single", "list", "keyed", "chain"] },
    scope: { type: "string", enum: ["root", "thread-maybe", "thread"] },
    description: { type: "string", minLength: 1, maxLength: 2000 },
    owner: {
      oneOf: [
        {
          type: "object",
          properties: { type: { const: "layout" }, nodeId: idSchema },
          required: ["type", "nodeId"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            type: { const: "plugin-instance" },
            instanceId: idSchema,
            outlet: idSchema,
          },
          required: ["type", "instanceId", "outlet"],
          additionalProperties: false,
        },
      ],
    },
    ownerProps: { type: "array", items: slotOwnerPropSchema, maxItems: 100 },
    fallback: { type: "string", enum: ["none", "owner"] },
    occupants: { type: "array", items: slotOccupantSchema, maxItems: 200 },
  },
  required: ["id", "kind", "scope", "description", "owner", "occupants"],
  additionalProperties: false,
} as const;
const occupantPlacementProperties = {
  id: idSchema,
  key: idSchema,
  order: { type: "number" },
} as const;
const patchProperties = {
  set: { type: "object" },
  removeKeys: { type: "array", items: idSchema, maxItems: 50 },
} as const;

const operationSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        type: { const: "add_instance" },
        instance: pluginInstanceSchema,
      },
      required: ["type", "instance"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "update_instance_props" },
        instanceId: idSchema,
        ...patchProperties,
      },
      required: ["type", "instanceId"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "set_instance_enabled" },
        instanceId: idSchema,
        enabled: { type: "boolean" },
      },
      required: ["type", "instanceId", "enabled"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { type: { const: "add_slot" }, slot: uiSlotSchema },
      required: ["type", "slot"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { type: { const: "remove_slot" }, slotId: idSchema },
      required: ["type", "slotId"],
      additionalProperties: false,
    },
    ...["mount_instance", "move_instance"].map((type) => ({
      type: "object",
      properties: {
        type: { const: type },
        instanceId: idSchema,
        slotId: idSchema,
        index: indexSchema,
        ...occupantPlacementProperties,
      },
      required: ["type", "instanceId", "slotId"],
      additionalProperties: false,
    })),
    ...["unmount_instance", "remove_instance"].map((type) => ({
      type: "object",
      properties: { type: { const: type }, instanceId: idSchema },
      required: ["type", "instanceId"],
      additionalProperties: false,
    })),
    {
      type: "object",
      properties: {
        type: { const: "replace_instance" },
        instanceId: idSchema,
        replacement: pluginInstanceSchema,
        slotId: idSchema,
        index: indexSchema,
        ...occupantPlacementProperties,
      },
      required: ["type", "instanceId", "replacement"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "insert_layout_node" },
        parentNodeId: idSchema,
        node: layoutNodeSchema,
        index: indexSchema,
        size: { oneOf: [{ type: "number", minimum: 0 }, idSchema] },
      },
      required: ["type", "parentNodeId", "node"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "update_layout_node_props" },
        nodeId: idSchema,
        ...patchProperties,
      },
      required: ["type", "nodeId"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "move_layout_node" },
        nodeId: idSchema,
        newParentNodeId: idSchema,
        index: indexSchema,
        size: { oneOf: [{ type: "number", minimum: 0 }, idSchema] },
      },
      required: ["type", "nodeId", "newParentNodeId"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "replace_layout_node" },
        nodeId: idSchema,
        node: layoutNodeSchema,
      },
      required: ["type", "nodeId", "node"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "remove_layout_node" },
        nodeId: idSchema,
      },
      required: ["type", "nodeId"],
      additionalProperties: false,
    },
  ],
} as const;

function codedError(error: unknown): string {
  return JSON.stringify({
    ok: false,
    error: {
      code:
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "APP_UI_MODEL_MUTATION_FAILED",
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

function parseChangedPaths(result: unknown): string[] {
  if (typeof result !== "object" || result === null || !("changedPaths" in result)) {
    throw new Error("Target mutation response does not contain changedPaths.");
  }
  const paths = result.changedPaths;
  if (!Array.isArray(paths) || !paths.every((item) => typeof item === "string")) {
    throw new Error("Target mutation response changedPaths is invalid.");
  }
  for (const filePath of paths) {
    if (!MUTABLE_PATHS.has(filePath)) {
      throw new Error(`Target mutation reported an unexpected changed path: ${filePath}`);
    }
  }
  return paths;
}

function successResult(
  result: unknown,
  activity: CreatorActivityRecorder | undefined,
): string {
  const enriched = {
    ok: true,
    result:
      typeof result === "object" && result !== null
        ? { ...result, mutationRevision: activity?.revision ?? 0 }
        : result,
  };
  const serialized = JSON.stringify(enriched);
  if (serialized.length <= MAX_MUTATION_RESULT_CHARACTERS) {
    return serialized;
  }
  return JSON.stringify({
    ok: false,
    error: {
      code: "APP_UI_MODEL_MUTATION_RESULT_TOO_LARGE",
      message: `Mutation result exceeds ${MAX_MUTATION_RESULT_CHARACTERS} characters.`,
    },
  });
}

export interface CreatorAppUIModelMutationInput {
  [key: string]: unknown;
  appUIModelHash: string;
  operations: unknown[];
}

export async function executeAppUIModelMutation(
  adapter: ProjectControlAdapter,
  activity: CreatorActivityRecorder | undefined,
  input: CreatorAppUIModelMutationInput,
): Promise<string> {
  try {
    await Promise.all(
      [...MUTABLE_PATHS].map((filePath) => activity?.captureBefore(filePath)),
    );
    const result = await adapter.request("mutate_app_ui_model", input);
    for (const filePath of parseChangedPaths(result)) {
      activity?.touch(filePath);
    }
    return successResult(result, activity);
  } catch (error) {
    return codedError(error);
  }
}

export function createAppUIModelTool(
  adapter: ProjectControlAdapter,
  activity?: CreatorActivityRecorder | undefined,
) {
  return tool(
    async (input: CreatorAppUIModelMutationInput) =>
      executeAppUIModelMutation(adapter, activity, input),
    {
      name: "mutate_app_ui_model",
      description:
        "Atomically apply one or more semantic AppUIModel operations using the exact hash returned by inspection. The target validates the complete model, mount semantics, and static Registry before writing either file. Use this instead of generic file edits for layout, Slots, PluginInstances, enabling, mounting, moving, replacing, or removing composition.",
      schema: {
        type: "object",
        properties: {
          appUIModelHash: {
            type: "string",
            pattern: "^[a-f0-9]{64}$",
            description: "Exact SHA-256 hash from inspect_ui_project or inspect_app_ui_model.",
          },
          operations: {
            type: "array",
            items: operationSchema,
            minItems: 1,
            maxItems: 100,
          },
        },
        required: ["appUIModelHash", "operations"],
        additionalProperties: false,
      },
    },
  );
}
