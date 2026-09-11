import path from "node:path";

import type {
  AgentUISourceItem,
  AgentUISourceRegistryManifest,
} from "./types.js";

export const MAX_AGENT_UI_SOURCE_FILES = 50;
export const MAX_AGENT_UI_SOURCE_FILE_BYTES = 256 * 1024;
export const MAX_AGENT_UI_SOURCE_ITEM_BYTES = 2 * 1024 * 1024;

const ITEM_ID = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;
const PACKAGE_NAME = /^(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)$/i;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SEMVER_RANGE = /^(?:[~^]|>=?|<=?)?\s*(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))?(?:\.(?:0|[1-9]\d*))?(?:-[0-9A-Za-z.-]+)?(?:\s+(?:>=?|<=?)\s*(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))?(?:\.(?:0|[1-9]\d*))?(?:-[0-9A-Za-z.-]+)?)*$/;
const GIT_COMMIT_SHA = /^[a-f0-9]{40}$/;
const FORBIDDEN_UPSTREAM_REVISIONS = new Set(["latest", "main", "master"]);

export class AgentUISourceRegistryError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AgentUISourceRegistryError";
    this.code = code;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertSafeRegistryRelativePath(
  value: unknown,
  field: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.startsWith("~") ||
    /^[A-Za-z]:/.test(value)
  ) {
    throw new AgentUISourceRegistryError(
      "AGENT_UI_SOURCE_INVALID_PATH",
      `${field} must be a safe relative POSIX path.`,
      { path: value },
    );
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new AgentUISourceRegistryError(
      "AGENT_UI_SOURCE_INVALID_PATH",
      `${field} escapes or is not normalized.`,
      { path: value },
    );
  }
}

export function parseRegistryManifest(
  value: unknown,
): AgentUISourceRegistryManifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.items)) {
    throw new AgentUISourceRegistryError(
      "AGENT_UI_SOURCE_REGISTRY_INVALID",
      "registry.json must use schemaVersion 1 and declare items.",
    );
  }
  const items = value.items.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !ITEM_ID.test(entry.id)) {
      throw new AgentUISourceRegistryError(
        "AGENT_UI_SOURCE_REGISTRY_INVALID",
        `registry.json items[${index}].id is invalid.`,
      );
    }
    assertSafeRegistryRelativePath(entry.path, `registry.json items[${index}].path`);
    return { id: entry.id, path: entry.path };
  });
  return { schemaVersion: 1, items };
}

export function parseSourceItem(value: unknown, manifestPath: string): AgentUISourceItem {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new AgentUISourceRegistryError(
      "AGENT_UI_SOURCE_ITEM_INVALID",
      `${manifestPath} must use schemaVersion 1.`,
    );
  }
  if (typeof value.id !== "string" || !ITEM_ID.test(value.id)) {
    throw new AgentUISourceRegistryError(
      "AGENT_UI_SOURCE_ITEM_INVALID",
      `${manifestPath} has an invalid item id.`,
    );
  }
  if (typeof value.version !== "string" || !SEMVER.test(value.version)) {
    throw new AgentUISourceRegistryError(
      "AGENT_UI_SOURCE_ITEM_INVALID",
      `${manifestPath} has an invalid semantic version.`,
    );
  }
  if (!(["foundation", "primitive", "agent-component"] as const).includes(value.kind as never)) {
    throw new AgentUISourceRegistryError(
      "AGENT_UI_SOURCE_ITEM_INVALID",
      `${manifestPath} has an invalid kind.`,
    );
  }
  if (typeof value.description !== "string" || value.description.trim().length === 0) {
    throw new AgentUISourceRegistryError(
      "AGENT_UI_SOURCE_ITEM_INVALID",
      `${manifestPath} must have a description.`,
    );
  }
  let upstream: AgentUISourceItem["upstream"];
  if (value.upstream !== undefined) {
    if (
      !isRecord(value.upstream) ||
      typeof value.upstream.project !== "string" ||
      value.upstream.project.trim().length === 0 ||
      !(value.upstream.mode === "adapted" || value.upstream.mode === "original")
    ) {
      throw new AgentUISourceRegistryError(
        "AGENT_UI_SOURCE_ITEM_INVALID",
        `${manifestPath} has invalid upstream metadata.`,
      );
    }
    for (const field of ["component", "implementation", "revision", "license"] as const) {
      const fieldValue = value.upstream[field];
      if (fieldValue !== undefined && (typeof fieldValue !== "string" || fieldValue.trim().length === 0)) {
        throw new AgentUISourceRegistryError(
          "AGENT_UI_SOURCE_ITEM_INVALID",
          `${manifestPath} upstream.${field} must be a non-empty string.`,
        );
      }
    }
    if (
      typeof value.upstream.revision === "string" &&
      FORBIDDEN_UPSTREAM_REVISIONS.has(value.upstream.revision.toLowerCase())
    ) {
      throw new AgentUISourceRegistryError(
        "AGENT_UI_SOURCE_ITEM_INVALID",
        `${manifestPath} must pin an exact upstream revision.`,
      );
    }
    if (
      value.upstream.mode === "adapted" &&
      (typeof value.upstream.component !== "string" ||
        typeof value.upstream.revision !== "string" ||
        !GIT_COMMIT_SHA.test(value.upstream.revision) ||
        typeof value.upstream.license !== "string")
    ) {
      throw new AgentUISourceRegistryError(
        "AGENT_UI_SOURCE_ITEM_INVALID",
        `${manifestPath} adapted upstream metadata requires component, revision, and license.`,
      );
    }
    const component = typeof value.upstream.component === "string"
      ? value.upstream.component
      : undefined;
    const implementation = typeof value.upstream.implementation === "string"
      ? value.upstream.implementation
      : undefined;
    const revision = typeof value.upstream.revision === "string"
      ? value.upstream.revision
      : undefined;
    const license = typeof value.upstream.license === "string"
      ? value.upstream.license
      : undefined;
    upstream = {
      project: value.upstream.project,
      mode: value.upstream.mode,
      ...(component === undefined ? {} : { component }),
      ...(implementation === undefined ? {} : { implementation }),
      ...(revision === undefined ? {} : { revision }),
      ...(license === undefined ? {} : { license }),
    };
  }
  if (!Array.isArray(value.files) || value.files.length === 0) {
    throw new AgentUISourceRegistryError(
      "AGENT_UI_SOURCE_ITEM_INVALID",
      `${manifestPath} must declare at least one file.`,
    );
  }
  if (value.files.length > MAX_AGENT_UI_SOURCE_FILES) {
    throw new AgentUISourceRegistryError(
      "AGENT_UI_SOURCE_ITEM_LIMIT_EXCEEDED",
      `${manifestPath} exceeds the ${MAX_AGENT_UI_SOURCE_FILES}-file limit.`,
    );
  }
  const files = value.files.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new AgentUISourceRegistryError(
        "AGENT_UI_SOURCE_ITEM_INVALID",
        `${manifestPath} files[${index}] must be an object.`,
      );
    }
    assertSafeRegistryRelativePath(entry.source, `${manifestPath} files[${index}].source`);
    assertSafeRegistryRelativePath(entry.target, `${manifestPath} files[${index}].target`);
    return { source: entry.source, target: entry.target };
  });
  const requires = value.requires === undefined
    ? undefined
    : Array.isArray(value.requires) && value.requires.every((item) => typeof item === "string" && ITEM_ID.test(item))
      ? [...value.requires] as string[]
      : null;
  if (requires === null) {
    throw new AgentUISourceRegistryError(
      "AGENT_UI_SOURCE_ITEM_INVALID",
      `${manifestPath} has invalid requires.`,
    );
  }
  let packages: Record<string, string> | undefined;
  if (value.packages !== undefined) {
    if (!isRecord(value.packages)) {
      throw new AgentUISourceRegistryError(
        "AGENT_UI_SOURCE_ITEM_INVALID",
        `${manifestPath} packages must be an object.`,
      );
    }
    packages = {};
    for (const [name, range] of Object.entries(value.packages)) {
      if (!PACKAGE_NAME.test(name) || typeof range !== "string" || !SEMVER_RANGE.test(range)) {
        throw new AgentUISourceRegistryError(
          "AGENT_UI_SOURCE_ITEM_INVALID",
          `${manifestPath} has an invalid package requirement for ${name}.`,
        );
      }
      packages[name] = range;
    }
  }
  return {
    schemaVersion: 1,
    id: value.id,
    version: value.version,
    kind: value.kind as AgentUISourceItem["kind"],
    description: value.description,
    ...(upstream === undefined ? {} : { upstream }),
    ...(requires === undefined ? {} : { requires }),
    ...(packages === undefined ? {} : { packages }),
    files,
  };
}
