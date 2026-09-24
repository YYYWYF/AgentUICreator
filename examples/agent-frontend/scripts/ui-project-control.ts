import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import {
  appUITransactionInputSchema,
  mutateAppUIModel,
  recoverPendingAppUITransaction,
} from "./ui-project/app-ui-transaction";
import { inspectUIComposition, inspectUIProject } from "./ui-project/project-inspector";
import { inspectPluginSourceReferences } from "./ui-project/plugin-source-references";
import { collectPluginAssets } from "./ui-project/plugin-assets";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths } from "./ui-project/agent-ui-project-paths";
import { readAgentUIProjectConfig } from "./ui-project/project-mode";
import { inspectUIServiceDependencies } from "./ui-project/service-dependency-inspector";
import {
  applyAgentUISourceItem,
  inspectAgentUISources,
  removeAgentUISourceItems,
  recoverPendingAgentUISourceTransaction,
} from "./ui-project/source-registry";
import {
  verifyRuntimeComposition,
  verifyRuntimeCompositionInputSchema,
} from "./ui-project/runtime-composition-verifier";

export const UI_PROJECT_CONTROL_SCHEMA_VERSION = 3 as const;
export const MAX_UI_PROJECT_CONTROL_INPUT_BYTES = 64_000;
export const MAX_UI_PROJECT_CONTROL_OUTPUT_BYTES = 512_000;
export const MAX_APP_UI_MODEL_CHARACTERS = 120_000;
export const MAX_PLUGIN_SOURCE_CHARACTERS = 24_000;
export const MAX_PLUGIN_FILES = 100;

const defaultProjectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

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
  parentInstanceId: z.string().trim().min(1).max(200),
  slot: z.string().trim().min(1).max(200),
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
const requestSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    schemaVersion: z.literal(UI_PROJECT_CONTROL_SCHEMA_VERSION),
    operation: z.literal("inspect_ui_project"),
    input: inspectUIProjectInputSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(UI_PROJECT_CONTROL_SCHEMA_VERSION),
    operation: z.literal("inspect_app_ui_model"),
    input: emptyInputSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(UI_PROJECT_CONTROL_SCHEMA_VERSION),
    operation: z.literal("inspect_ui_slots"),
    input: inspectUISlotsInputSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(UI_PROJECT_CONTROL_SCHEMA_VERSION),
    operation: z.literal("list_ui_plugins"),
    input: emptyInputSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(UI_PROJECT_CONTROL_SCHEMA_VERSION),
    operation: z.literal("inspect_ui_services"),
    input: emptyInputSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(UI_PROJECT_CONTROL_SCHEMA_VERSION),
    operation: z.literal("inspect_ui_plugin"),
    input: z.strictObject({ pluginId: z.string().trim().min(1).max(200) }),
  }),
  z.strictObject({
    schemaVersion: z.literal(UI_PROJECT_CONTROL_SCHEMA_VERSION),
    operation: z.literal("inspect_ui_plugin_source_references"),
    input: z.strictObject({ pluginId: z.string().trim().min(1).max(200) }),
  }),
  z.strictObject({
    schemaVersion: z.literal(UI_PROJECT_CONTROL_SCHEMA_VERSION),
    operation: z.literal("verify_runtime_composition"),
    input: verifyRuntimeCompositionInputSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(UI_PROJECT_CONTROL_SCHEMA_VERSION),
    operation: z.literal("mutate_app_ui_model"),
    input: appUITransactionInputSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(UI_PROJECT_CONTROL_SCHEMA_VERSION),
    operation: z.literal("inspect_agent_ui_sources"),
    input: emptyInputSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(UI_PROJECT_CONTROL_SCHEMA_VERSION),
    operation: z.literal("apply_agent_ui_source_item"),
    input: z.strictObject({
      itemId: z.string().trim().min(1).max(200),
      expectedStateHash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  }),
  z.strictObject({
    schemaVersion: z.literal(UI_PROJECT_CONTROL_SCHEMA_VERSION),
    operation: z.literal("remove_agent_ui_source_items"),
    input: z.strictObject({
      itemIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
      expectedStateHash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  }),
]);

type UIProjectControlRequest = z.infer<typeof requestSchema>;

export interface UIProjectControlSuccess {
  schemaVersion: typeof UI_PROJECT_CONTROL_SCHEMA_VERSION;
  ok: true;
  result: unknown;
}

export interface UIProjectControlFailure {
  schemaVersion: typeof UI_PROJECT_CONTROL_SCHEMA_VERSION;
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type UIProjectControlResponse =
  | UIProjectControlSuccess
  | UIProjectControlFailure;

class UIProjectControlError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "UIProjectControlError";
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
    throw new UIProjectControlError(
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
      throw new UIProjectControlError(
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
    throw new UIProjectControlError(
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
): Promise<unknown> {
  const inspection = await inspectUIProject(projectRoot);
  const matches = inspection.pluginAssets.filter(
    (asset) => asset.pluginId === pluginId,
  );
  if (matches.length === 0) {
    throw new UIProjectControlError(
      "UI_PLUGIN_NOT_FOUND",
      `No plugins/*/manifest.json declares UI plugin "${pluginId}".`,
    );
  }
  if (matches.length > 1) {
    throw new UIProjectControlError(
      "UI_PLUGIN_ID_AMBIGUOUS",
      `Multiple plugin assets declare UI plugin "${pluginId}".`,
      { manifestPaths: matches.map((asset) => asset.manifestPath) },
    );
  }

  const asset = matches[0];
  if (asset === undefined) {
    throw new UIProjectControlError(
      "UI_PLUGIN_NOT_FOUND",
      `UI plugin "${pluginId}" is unavailable.`,
    );
  }
  const pluginRoot = path.join(projectRoot, "plugins", asset.directory);
  const allEntries = (await readdir(pluginRoot, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  const entries = allEntries.slice(0, MAX_PLUGIN_FILES);
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = `plugins/${asset.directory}/${entry.name}`;
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
  const serviceInspection = await inspectUIServices(projectRoot);
  const serviceDeclaration = serviceInspection.plugins.find(
    (plugin) => plugin.pluginId === pluginId,
  );

  return {
    appUIModelHash: inspection.appUIModel.hash,
    asset,
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
    projectControlConfigForPaths(paths),
  );
  const inspection = inspectUIServiceDependencies(
    projectRoot,
    model,
    inventory.assets,
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
  const inspection = await inspectUIProject(projectRoot);
  const matches = inspection.pluginAssets.filter(
    (asset) => asset.pluginId === pluginId,
  );
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new UIProjectControlError(
      matches.length === 0 ? "UI_PLUGIN_NOT_FOUND" : "UI_PLUGIN_ID_AMBIGUOUS",
      matches.length === 0
        ? `No plugins/*/manifest.json declares UI plugin "${pluginId}".`
        : `Multiple plugin assets declare UI plugin "${pluginId}".`,
    );
  }
  return inspectPluginSourceReferences(
    projectRoot,
    pluginId,
    matches[0].directory,
  );
}

async function executeRequest(
  request: UIProjectControlRequest,
  projectRoot: string,
): Promise<unknown> {
  const projectConfig = await readAgentUIProjectConfig(projectRoot);
  const effectiveConfig = projectControlConfigForPaths(
    resolveAgentUIProjectPaths(projectRoot, projectConfig.config),
  );
  switch (request.operation) {
    case "inspect_ui_project":
      return "view" in request.input && request.input.view === "composition"
        ? inspectUIComposition(projectRoot)
        : inspectUIProject(projectRoot);
    case "inspect_app_ui_model":
      return inspectAppUIModel(projectRoot);
    case "inspect_ui_slots":
      return inspectUISlots(projectRoot, request.input);
    case "list_ui_plugins":
      return listUIPlugins(projectRoot);
    case "inspect_ui_services":
      return inspectUIServices(projectRoot);
    case "inspect_ui_plugin":
      return inspectUIPlugin(projectRoot, request.input.pluginId);
    case "inspect_ui_plugin_source_references":
      return inspectUIPluginSourceReferences(
        projectRoot,
        request.input.pluginId,
      );
    case "verify_runtime_composition":
      return verifyRuntimeComposition(projectRoot, request.input);
    case "mutate_app_ui_model":
      return mutateAppUIModel(projectRoot, request.input);
    case "inspect_agent_ui_sources":
      return inspectAgentUISources(projectRoot, effectiveConfig);
    case "apply_agent_ui_source_item":
      return applyAgentUISourceItem(projectRoot, request.input, effectiveConfig);
    case "remove_agent_ui_source_items":
      return removeAgentUISourceItems(projectRoot, request.input, effectiveConfig);
  }
}

function failure(error: unknown): UIProjectControlFailure {
  if (
    error instanceof UIProjectControlError ||
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
      schemaVersion: UI_PROJECT_CONTROL_SCHEMA_VERSION,
      ok: false,
      error: {
        code: codedError.code,
        message: codedError.message,
        ...(codedError.details === undefined
          ? {}
          : { details: codedError.details }),
      },
    };
  }
  if (error instanceof z.ZodError) {
    return {
      schemaVersion: UI_PROJECT_CONTROL_SCHEMA_VERSION,
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: z.prettifyError(error),
      },
    };
  }
  return {
    schemaVersion: UI_PROJECT_CONTROL_SCHEMA_VERSION,
    ok: false,
    error: {
      code: "CONTROL_OPERATION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

export async function handleUIProjectControlRequest(
  input: unknown,
  projectRoot = defaultProjectRoot,
): Promise<UIProjectControlResponse> {
  try {
    const projectConfig = await readAgentUIProjectConfig(projectRoot);
    const effectiveConfig = projectControlConfigForPaths(
      resolveAgentUIProjectPaths(projectRoot, projectConfig.config),
    );
    await recoverPendingAppUITransaction(projectRoot);
    await recoverPendingAgentUISourceTransaction(
      projectRoot,
      effectiveConfig,
    );
    return {
      schemaVersion: UI_PROJECT_CONTROL_SCHEMA_VERSION,
      ok: true,
      result: await executeRequest(requestSchema.parse(input), projectRoot),
    };
  } catch (error) {
    return failure(error);
  }
}

async function readStandardInput(): Promise<string> {
  let source = "";
  for await (const chunk of process.stdin) {
    source += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (Buffer.byteLength(source, "utf8") > MAX_UI_PROJECT_CONTROL_INPUT_BYTES) {
      throw new UIProjectControlError(
        "INPUT_TOO_LARGE",
        `Control request exceeds ${MAX_UI_PROJECT_CONTROL_INPUT_BYTES} bytes.`,
      );
    }
  }
  return source;
}

async function main(): Promise<void> {
  let response: UIProjectControlResponse;
  try {
    response = await handleUIProjectControlRequest(
      JSON.parse(await readStandardInput()) as unknown,
      defaultProjectRoot,
    );
  } catch (error) {
    response = failure(error);
  }

  let output = JSON.stringify(response);
  if (Buffer.byteLength(output, "utf8") > MAX_UI_PROJECT_CONTROL_OUTPUT_BYTES) {
    output = JSON.stringify(
      failure(
        new UIProjectControlError(
          "OUTPUT_TOO_LARGE",
          `Control response exceeds ${MAX_UI_PROJECT_CONTROL_OUTPUT_BYTES} bytes. Narrow the inspection request.`,
        ),
      ),
    );
  }
  process.stdout.write(`${output}\n`);
  if (!response.ok) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
