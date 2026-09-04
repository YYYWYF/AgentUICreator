export const CREATOR_PROJECT_CONTROL_SCHEMA_VERSION = 2 as const;

export interface ProjectIssue {
  code: string;
  message: string;
}

export interface ProjectSlot {
  slotId: string;
  nodeId: string;
  nodePath: string;
  /** Configured mounts only; activation determines runtime contributions. */
  mounts: Array<{
    instanceId: string;
    pluginId: string;
    enabled: boolean;
    order?: number | undefined;
  }>;
}

export interface ProjectPluginInstance {
  id: string;
  pluginId: string;
  enabled: boolean;
  mount?: { slotId: string; order?: number | undefined } | undefined;
  props?: Record<string, unknown> | undefined;
  mountedSlotId?: string | undefined;
}

export interface ProjectPluginAsset {
  pluginId: string;
  name?: string | undefined;
  directory: string;
  manifestPath: string;
  definitionPath: string;
  capabilities: string[];
  selected: boolean;
}

export interface UIProjectInspection {
  schemaVersion: typeof CREATOR_PROJECT_CONTROL_SCHEMA_VERSION;
  appUIModel: {
    hash: string;
    version: string;
    layout: unknown;
    slots: ProjectSlot[];
  };
  pluginInstances: ProjectPluginInstance[];
  registry: {
    selectedPluginIds: string[];
    registeredPluginIds: string[];
    generatedFileFresh: boolean;
    issues: ProjectIssue[];
  };
  pluginAssets: ProjectPluginAsset[];
  catalogs: Array<{ path: string; exists: boolean }>;
  uiStack: Array<{ packageName: string; version: string }>;
}

export interface ProjectPluginSourceReference {
  path: string;
  line: number;
  column: number;
  kind: "module" | "plugin-id-literal" | "plugin-id-manifest";
  value: string;
}

export interface ProjectPluginSourceReferenceInspection {
  pluginId: string;
  directory: string;
  references: ProjectPluginSourceReference[];
  truncated: boolean;
}

export type ProjectControlOperation =
  | "inspect_ui_project"
  | "inspect_app_ui_model"
  | "inspect_ui_slots"
  | "list_ui_plugins"
  | "inspect_ui_plugin"
  | "inspect_ui_plugin_source_references"
  | "mutate_app_ui_model";

export interface ProjectControlRequest {
  schemaVersion: typeof CREATOR_PROJECT_CONTROL_SCHEMA_VERSION;
  operation: ProjectControlOperation;
  input: Record<string, unknown>;
}

export type ProjectControlResponse =
  | {
      schemaVersion: typeof CREATOR_PROJECT_CONTROL_SCHEMA_VERSION;
      ok: true;
      result: unknown;
    }
  | {
      schemaVersion: typeof CREATOR_PROJECT_CONTROL_SCHEMA_VERSION;
      ok: false;
      error: { code: string; message: string; details?: unknown };
    };

export interface CreatorProjectValidationMetadata {
  command: string;
  status: "passed" | "failed";
  runId: string;
  revision: number;
  current: boolean;
}

export interface CreatorProjectVerificationMetadata {
  status: "not-run" | "changed-and-verified" | "no-project-change" | "failed";
  runId: string;
  revision: number;
  current: boolean;
}

export interface CreatorProjectControlMetadata {
  runId: string;
  mutationRevision: number;
  validations: CreatorProjectValidationMetadata[];
  verification: CreatorProjectVerificationMetadata;
  runtimeDiagnostics:
    | { available: false }
    | {
        available: true;
        currentOpenCount: number;
        resolvedCurrentCount: number;
        staleOpenCount: number;
        latestAt?: string | undefined;
      };
}

export class ProjectControlSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectControlSchemaError";
  }
}

function record(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProjectControlSchemaError(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new ProjectControlSchemaError(`${path} must be a string.`);
  }
  return value;
}

function literal<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  const parsed = string(value, path);
  if (!allowed.includes(parsed as T)) {
    throw new ProjectControlSchemaError(
      `${path} must be one of ${allowed.join(", ")}.`,
    );
  }
  return parsed as T;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProjectControlSchemaError(`${path} must be a boolean.`);
  }
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProjectControlSchemaError(`${path} must be a finite number.`);
  }
  return value;
}

function array<T>(
  value: unknown,
  path: string,
  parse: (item: unknown, itemPath: string) => T,
): T[] {
  if (!Array.isArray(value)) {
    throw new ProjectControlSchemaError(`${path} must be an array.`);
  }
  return value.map((item, index) => parse(item, `${path}[${index}]`));
}

function strings(value: unknown, path: string): string[] {
  return array(value, path, string);
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ProjectControlSchemaError(
      `${path} must be a non-negative integer.`,
    );
  }
  return value as number;
}

function schemaVersion(value: unknown): void {
  if (value !== CREATOR_PROJECT_CONTROL_SCHEMA_VERSION) {
    throw new ProjectControlSchemaError(
      `schemaVersion must be ${CREATOR_PROJECT_CONTROL_SCHEMA_VERSION}.`,
    );
  }
}

export function parseProjectControlResponse(
  input: unknown,
): ProjectControlResponse {
  const source = record(input, "response");
  schemaVersion(source.schemaVersion);
  const ok = boolean(source.ok, "response.ok");
  if (ok) {
    return {
      schemaVersion: CREATOR_PROJECT_CONTROL_SCHEMA_VERSION,
      ok: true,
      result: source.result,
    };
  }
  const error = record(source.error, "response.error");
  return {
    schemaVersion: CREATOR_PROJECT_CONTROL_SCHEMA_VERSION,
    ok: false,
    error: {
      code: string(error.code, "response.error.code"),
      message: string(error.message, "response.error.message"),
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}

function parseIssue(input: unknown, path: string): ProjectIssue {
  const source = record(input, path);
  return {
    code: string(source.code, `${path}.code`),
    message: string(source.message, `${path}.message`),
  };
}

function parseSlot(input: unknown, path: string): ProjectSlot {
  const source = record(input, path);
  return {
    slotId: string(source.slotId, `${path}.slotId`),
    nodeId: string(source.nodeId, `${path}.nodeId`),
    nodePath: string(source.nodePath, `${path}.nodePath`),
    mounts: array(source.mounts, `${path}.mounts`, (item, itemPath) => {
      const mount = record(item, itemPath);
      return {
        instanceId: string(mount.instanceId, `${itemPath}.instanceId`),
        pluginId: string(mount.pluginId, `${itemPath}.pluginId`),
        enabled: boolean(mount.enabled, `${itemPath}.enabled`),
        ...(mount.order === undefined ? {} : { order: finiteNumber(mount.order, `${itemPath}.order`) }),
      };
    }),
  };
}

function parseMount(input: unknown, path: string): NonNullable<ProjectPluginInstance["mount"]> {
  const source = record(input, path);
  return {
    slotId: string(source.slotId, `${path}.slotId`),
    ...(source.order === undefined ? {} : { order: finiteNumber(source.order, `${path}.order`) }),
  };
}

function parsePluginInstance(
  input: unknown,
  path: string,
): ProjectPluginInstance {
  const source = record(input, path);
  return {
    id: string(source.id, `${path}.id`),
    pluginId: string(source.pluginId, `${path}.pluginId`),
    enabled: boolean(source.enabled, `${path}.enabled`),
    ...(source.mount === undefined ? {} : { mount: parseMount(source.mount, `${path}.mount`) }),
    ...(source.props === undefined
      ? {}
      : { props: record(source.props, `${path}.props`) }),
    ...(source.mountedSlotId === undefined
      ? {}
      : {
          mountedSlotId: string(
            source.mountedSlotId,
            `${path}.mountedSlotId`,
          ),
        }),
  };
}

function parsePluginAsset(
  input: unknown,
  path: string,
): ProjectPluginAsset {
  const source = record(input, path);
  return {
    pluginId: string(source.pluginId, `${path}.pluginId`),
    ...(source.name === undefined
      ? {}
      : { name: string(source.name, `${path}.name`) }),
    directory: string(source.directory, `${path}.directory`),
    manifestPath: string(source.manifestPath, `${path}.manifestPath`),
    definitionPath: string(source.definitionPath, `${path}.definitionPath`),
    capabilities: strings(source.capabilities, `${path}.capabilities`),
    selected: boolean(source.selected, `${path}.selected`),
  };
}

export function parseUIProjectInspection(input: unknown): UIProjectInspection {
  const source = record(input, "inspection");
  schemaVersion(source.schemaVersion);
  const appUIModel = record(source.appUIModel, "inspection.appUIModel");
  const hash = string(appUIModel.hash, "inspection.appUIModel.hash");
  if (!/^[a-f0-9]{64}$/u.test(hash)) {
    throw new ProjectControlSchemaError(
      "inspection.appUIModel.hash must be a lowercase SHA-256 hash.",
    );
  }
  const registry = record(source.registry, "inspection.registry");
  return {
    schemaVersion: CREATOR_PROJECT_CONTROL_SCHEMA_VERSION,
    appUIModel: {
      hash,
      version: string(appUIModel.version, "inspection.appUIModel.version"),
      layout: appUIModel.layout,
      slots: array(appUIModel.slots, "inspection.appUIModel.slots", parseSlot),
    },
    pluginInstances: array(
      source.pluginInstances,
      "inspection.pluginInstances",
      parsePluginInstance,
    ),
    registry: {
      selectedPluginIds: strings(
        registry.selectedPluginIds,
        "inspection.registry.selectedPluginIds",
      ),
      registeredPluginIds: strings(
        registry.registeredPluginIds,
        "inspection.registry.registeredPluginIds",
      ),
      generatedFileFresh: boolean(
        registry.generatedFileFresh,
        "inspection.registry.generatedFileFresh",
      ),
      issues: array(
        registry.issues,
        "inspection.registry.issues",
        parseIssue,
      ),
    },
    pluginAssets: array(
      source.pluginAssets,
      "inspection.pluginAssets",
      parsePluginAsset,
    ),
    catalogs: array(source.catalogs, "inspection.catalogs", (item, path) => {
      const catalog = record(item, path);
      return {
        path: string(catalog.path, `${path}.path`),
        exists: boolean(catalog.exists, `${path}.exists`),
      };
    }),
    uiStack: array(source.uiStack, "inspection.uiStack", (item, path) => {
      const dependency = record(item, path);
      return {
        packageName: string(dependency.packageName, `${path}.packageName`),
        version: string(dependency.version, `${path}.version`),
      };
    }),
  };
}

function parsePluginSourceReference(
  input: unknown,
  path: string,
): ProjectPluginSourceReference {
  const source = record(input, path);
  const kind = string(source.kind, `${path}.kind`);
  if (
    kind !== "module" &&
    kind !== "plugin-id-literal" &&
    kind !== "plugin-id-manifest"
  ) {
    throw new ProjectControlSchemaError(`${path}.kind is invalid.`);
  }
  return {
    path: string(source.path, `${path}.path`),
    line: nonNegativeInteger(source.line, `${path}.line`),
    column: nonNegativeInteger(source.column, `${path}.column`),
    kind,
    value: string(source.value, `${path}.value`),
  };
}

export function parsePluginSourceReferenceInspection(
  input: unknown,
): ProjectPluginSourceReferenceInspection {
  const source = record(input, "pluginSourceReferences");
  return {
    pluginId: string(source.pluginId, "pluginSourceReferences.pluginId"),
    directory: string(source.directory, "pluginSourceReferences.directory"),
    references: array(
      source.references,
      "pluginSourceReferences.references",
      parsePluginSourceReference,
    ),
    truncated: boolean(
      source.truncated,
      "pluginSourceReferences.truncated",
    ),
  };
}
