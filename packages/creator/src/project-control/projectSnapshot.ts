import type { CreatorActivityRecorder } from "../CreatorActivityRecorder.js";
import {
  ProjectControlAdapterError,
  type ProjectControlAdapter,
} from "./ProjectControlAdapter.js";
import {
  parseUIProjectInspection,
  type CreatorProjectControlMetadata,
  type UIProjectInspection,
} from "./types.js";
import type { CreatorRuntimeDiagnosticSession } from "../runtime-diagnostics/CreatorRuntimeDiagnosticStore.js";

export const MAX_PROJECT_SNAPSHOT_PROMPT_CHARACTERS = 12_000;
export const MAX_PROJECT_SNAPSHOT_SLOTS = 40;
export const MAX_PROJECT_SNAPSHOT_INSTANCES = 80;
export const MAX_PROJECT_SNAPSHOT_ASSETS = 100;
export const MAX_PROJECT_SNAPSHOT_PROP_KEYS = 30;
export const MAX_PROJECT_SNAPSHOT_LAYOUT_NODES = 80;
export const MAX_PROJECT_SNAPSHOT_LAYOUT_DEPTH = 10;
const MAX_SNAPSHOT_STRING_CHARACTERS = 200;

interface SnapshotLimitState {
  nodes: number;
  truncated: boolean;
}

export interface CreatorProjectSnapshot {
  schemaVersion: 1;
  status: "available" | "unavailable";
  project?: Record<string, unknown> | undefined;
  creator: CreatorProjectControlMetadata;
  error?: { code: string; message: string } | undefined;
  truncated: boolean;
}

function defaultMetadata(): CreatorProjectControlMetadata {
  return {
    runId: "unavailable",
    mutationRevision: 0,
    validations: [],
    verification: {
      status: "not-run",
      runId: "unavailable",
      revision: 0,
      current: true,
    },
    runtimeDiagnostics: { available: false },
  };
}

function safeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.length <= MAX_SNAPSHOT_STRING_CHARACTERS
    ? value
    : `${value.slice(0, MAX_SNAPSHOT_STRING_CHARACTERS)}…`;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function compactLayout(
  value: unknown,
  depth: number,
  state: SnapshotLimitState,
): Record<string, unknown> | undefined {
  const node = recordValue(value);
  if (node === undefined) {
    return undefined;
  }
  if (
    depth > MAX_PROJECT_SNAPSHOT_LAYOUT_DEPTH ||
    state.nodes >= MAX_PROJECT_SNAPSHOT_LAYOUT_NODES
  ) {
    state.truncated = true;
    return undefined;
  }
  state.nodes += 1;
  const compact: Record<string, unknown> = {};
  for (const key of [
    "id",
    "type",
    "slotId",
    "active",
    "width",
    "height",
    "minWidth",
    "maxWidth",
    "resizable",
    "gap",
    "sizes",
  ]) {
    const field = node[key];
    if (field !== undefined) {
      compact[key] = field;
    }
  }
  if (node.child !== undefined) {
    const child = compactLayout(node.child, depth + 1, state);
    if (child !== undefined) {
      compact.child = child;
    }
  }
  if (Array.isArray(node.children)) {
    compact.children = node.children.flatMap((child) => {
      const compactChild = compactLayout(child, depth + 1, state);
      return compactChild === undefined ? [] : [compactChild];
    });
  }
  return compact;
}

function limited<T>(values: readonly T[], limit: number) {
  return {
    total: values.length,
    truncated: values.length > limit,
    items: values.slice(0, limit),
  };
}

export function createProjectSnapshot(
  inspection: UIProjectInspection,
  creator: CreatorProjectControlMetadata,
): CreatorProjectSnapshot {
  const layoutState: SnapshotLimitState = { nodes: 0, truncated: false };
  const slotPathById = new Map(
    inspection.appUIModel.slots.flatMap((slot) =>
      slot.nodePath === undefined ? [] : [[slot.slotId, slot.nodePath] as const],
    ),
  );
  const assetById = new Map(
    inspection.pluginAssets.map((asset) => [asset.pluginId, asset]),
  );
  const slots = limited(
    inspection.appUIModel.slots.map((slot) => ({
      slotId: safeText(slot.slotId),
      nodeId: safeText(slot.nodeId),
      nodePath: safeText(slot.nodePath),
      mounts: slot.mounts
        .slice(0, MAX_PROJECT_SNAPSHOT_INSTANCES)
        .map((mount) => ({
          instanceId: safeText(mount.instanceId),
          pluginId: safeText(mount.pluginId),
          enabled: mount.enabled,
          ...(mount.order === undefined ? {} : { order: mount.order }),
        })),
    })),
    MAX_PROJECT_SNAPSHOT_SLOTS,
  );
  const instances = limited(
    inspection.pluginInstances.map((instance) => {
      const asset = assetById.get(instance.pluginId);
      const propKeys = Object.keys(instance.props ?? {}).sort();
      return {
        id: safeText(instance.id),
        pluginId: safeText(instance.pluginId),
        enabled: instance.enabled,
        ...(instance.mount === undefined ? {} : {
          mount: {
            slotId: safeText(instance.mount.slotId),
            ...(instance.mount.order === undefined ? {} : { order: instance.mount.order }),
          },
        }),
        headless: asset?.capabilities.includes("headless") ?? false,
        ...(instance.mountedSlotId === undefined
          ? {}
          : {
              mountedSlotId: safeText(instance.mountedSlotId),
              mountedNodePath: safeText(
                slotPathById.get(instance.mountedSlotId),
              ),
            }),
        propKeys: propKeys.slice(0, MAX_PROJECT_SNAPSHOT_PROP_KEYS).map(safeText),
        propsTruncated: propKeys.length > MAX_PROJECT_SNAPSHOT_PROP_KEYS,
      };
    }),
    MAX_PROJECT_SNAPSHOT_INSTANCES,
  );
  const assets = limited(
    inspection.pluginAssets.map((asset) => ({
      pluginId: safeText(asset.pluginId),
      directory: safeText(asset.directory),
      selected: asset.selected,
      capabilities: asset.capabilities.map(safeText),
    })),
    MAX_PROJECT_SNAPSHOT_ASSETS,
  );
  const layout = compactLayout(inspection.appUIModel.layout, 0, layoutState);
  const truncated =
    layoutState.truncated ||
    slots.truncated ||
    instances.truncated ||
    assets.truncated;

  return {
    schemaVersion: 1,
    status: "available",
    creator,
    truncated,
    project: {
      appUIModel: {
        hash: inspection.appUIModel.hash,
        version: safeText(inspection.appUIModel.version),
        layout,
        slots,
      },
      pluginInstances: instances,
      registry: {
        selectedPluginIds: inspection.registry.selectedPluginIds.map(safeText),
        registeredPluginIds:
          inspection.registry.registeredPluginIds.map(safeText),
        generatedFileFresh: inspection.registry.generatedFileFresh,
        issues: inspection.registry.issues.slice(0, 20),
      },
      pluginAssets: assets,
      catalogs: inspection.catalogs.slice(0, 20),
      uiStack: inspection.uiStack.slice(0, 30),
    },
  };
}

export async function loadProjectSnapshot(
  adapter: ProjectControlAdapter,
  activity?: CreatorActivityRecorder | undefined,
  runtimeDiagnostics?: CreatorRuntimeDiagnosticSession | undefined,
): Promise<CreatorProjectSnapshot> {
  const baseCreator = activity?.projectControlMetadata() ?? defaultMetadata();
  try {
    const result = await adapter.request("inspect_ui_project");
    let inspection: UIProjectInspection;
    try {
      inspection = parseUIProjectInspection(result);
    } catch {
      return {
        schemaVersion: 1,
        status: "unavailable",
        creator: baseCreator,
        truncated: false,
        error: {
          code: "CONTROL_RESULT_INVALID",
          message: "Target inspect_ui_project result failed schema validation.",
        },
      };
    }
    const creator: CreatorProjectControlMetadata = {
      ...baseCreator,
      runtimeDiagnostics:
        runtimeDiagnostics?.summary(inspection.appUIModel.hash) ??
        baseCreator.runtimeDiagnostics,
    };
    return createProjectSnapshot(inspection, creator);
  } catch (error) {
    return {
      schemaVersion: 1,
      status: "unavailable",
      creator: baseCreator,
      truncated: false,
      error: {
        code:
          error instanceof ProjectControlAdapterError
            ? error.code
            : "CONTROL_ADAPTER_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function formatProjectSnapshotForPrompt(
  snapshot: CreatorProjectSnapshot,
): string {
  const prefix = `Current target UI project snapshot (navigation summary only; use inspect tools for exact details):\n`;
  const serialized = JSON.stringify(snapshot);
  if (prefix.length + serialized.length <= MAX_PROJECT_SNAPSHOT_PROMPT_CHARACTERS) {
    return `${prefix}<ui-project-snapshot>${serialized}</ui-project-snapshot>`;
  }

  const project = snapshot.project;
  const appUIModel = recordValue(project?.appUIModel);
  const registry = recordValue(project?.registry);
  const fallback = {
    schemaVersion: 1,
    status: snapshot.status,
    creator: snapshot.creator,
    appUIModel: {
      hash: appUIModel?.hash,
      version: appUIModel?.version,
    },
    registry: {
      generatedFileFresh: registry?.generatedFileFresh,
    },
    error: snapshot.error,
    truncated: true,
  };
  return `${prefix}<ui-project-snapshot>${JSON.stringify(fallback)}</ui-project-snapshot>`;
}
