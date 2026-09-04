import { createHash } from "node:crypto";

export const CREATOR_RUNTIME_DIAGNOSTIC_SCHEMA_VERSION = 1 as const;
export const MAX_CREATOR_RUNTIME_DIAGNOSTIC_SCOPES = 50;
export const MAX_CREATOR_RUNTIME_DIAGNOSTICS_PER_SCOPE = 200;
export const MAX_CREATOR_RUNTIME_DIAGNOSTIC_RESULTS = 20;
export const MAX_CREATOR_RUNTIME_COMPOSITIONS_PER_SCOPE = 20;
export const MAX_CREATOR_RUNTIME_COMPOSITION_INSTANCES = 500;
export const CREATOR_RUNTIME_DIAGNOSTIC_TTL_MS = 24 * 60 * 60 * 1_000;
export const CREATOR_RUNTIME_COMPOSITION_SCHEMA_VERSION = 1 as const;

export type CreatorRuntimeDiagnosticKind =
  | "plugin-render"
  | "plugin-activation";
export type CreatorRuntimeDiagnosticStatus = "error" | "resolved";

export interface CreatorRuntimeDiagnostic {
  schemaVersion: typeof CREATOR_RUNTIME_DIAGNOSTIC_SCHEMA_VERSION;
  kind: CreatorRuntimeDiagnosticKind;
  status: CreatorRuntimeDiagnosticStatus;
  appUIModelHash: string;
  occurredAt: string;
  pluginId: string;
  instanceId: string;
  pluginName?: string | undefined;
  slotId?: string | undefined;
  slotPath?: string | undefined;
  errorMessage?: string | undefined;
  componentStack?: string | undefined;
}

export interface StoredCreatorRuntimeDiagnostic
  extends CreatorRuntimeDiagnostic {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  count: number;
  resolvedAt?: string | undefined;
  stale: boolean;
}

export interface CreatorRuntimeDiagnosticInspection {
  available: true;
  currentAppUIModelHash: string;
  currentErrors: StoredCreatorRuntimeDiagnostic[];
  resolvedCurrent: StoredCreatorRuntimeDiagnostic[];
  stale: StoredCreatorRuntimeDiagnostic[];
  summary: {
    currentOpenCount: number;
    resolvedCurrentCount: number;
    staleOpenCount: number;
    staleResolvedCount: number;
    latestAt?: string | undefined;
    truncated: boolean;
  };
}

export interface CreatorRuntimeDiagnosticSummary {
  available: true;
  currentOpenCount: number;
  resolvedCurrentCount: number;
  staleOpenCount: number;
  latestAt?: string | undefined;
}

export interface CreatorRuntimeCompositionInstance {
  instanceId: string;
  pluginId: string;
  slotId: string;
  slotPath?: string | undefined;
}

export interface CreatorRuntimeComposition {
  schemaVersion: typeof CREATOR_RUNTIME_COMPOSITION_SCHEMA_VERSION;
  appUIModelHash: string;
  observedAt: string;
  instances: CreatorRuntimeCompositionInstance[];
}

export interface CreatorRuntimeCompositionRecord
  extends CreatorRuntimeComposition {
  receivedAt: string;
}

interface StoredCompositionRecord extends CreatorRuntimeCompositionRecord {
  sequence: number;
}

export type CreatorRuntimeCompositionStatus =
  | "synced"
  | "stale"
  | "unavailable";

export interface CreatorRuntimeCompositionInspection {
  currentAppUIModelHash: string;
  runtimeAppUIModelHash?: string | undefined;
  runtimeStatus: CreatorRuntimeCompositionStatus;
  synchronized: boolean;
  observedAt?: string | undefined;
  receivedAt?: string | undefined;
  instances: CreatorRuntimeCompositionInstance[];
}

interface DiagnosticRecord extends CreatorRuntimeDiagnostic {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  count: number;
  resolvedAt?: string | undefined;
}

interface DiagnosticScope {
  lastAccessMs: number;
  records: DiagnosticRecord[];
  compositionSnapshots: StoredCompositionRecord[];
  nextCompositionSequence: number;
}

export class CreatorRuntimeDiagnosticSchemaError extends Error {
  readonly code = "RUNTIME_DIAGNOSTIC_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "CreatorRuntimeDiagnosticSchemaError";
  }
}

function boundedString(
  value: unknown,
  field: string,
  maximum: number,
  required = true,
): string | undefined {
  if (value === undefined && !required) {
    return undefined;
  }
  if (typeof value !== "string" || (required && value.trim() === "")) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      `${field} must be ${required ? "a non-blank" : "an optional"} string.`,
    );
  }
  if (value.length > maximum) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      `${field} exceeds ${maximum} characters.`,
    );
  }
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  maximum: number,
): string | undefined {
  return boundedString(value, field, maximum, false);
}

export function parseCreatorRuntimeDiagnostic(
  input: unknown,
): CreatorRuntimeDiagnostic {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      "diagnostic must be an object.",
    );
  }
  const source = input as Record<string, unknown>;
  if (source.schemaVersion !== CREATOR_RUNTIME_DIAGNOSTIC_SCHEMA_VERSION) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      `diagnostic.schemaVersion must be ${CREATOR_RUNTIME_DIAGNOSTIC_SCHEMA_VERSION}.`,
    );
  }
  if (
    source.kind !== "plugin-render" &&
    source.kind !== "plugin-activation"
  ) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      "diagnostic.kind is unsupported.",
    );
  }
  if (source.status !== "error" && source.status !== "resolved") {
    throw new CreatorRuntimeDiagnosticSchemaError(
      "diagnostic.status is unsupported.",
    );
  }
  const appUIModelHash = boundedString(
    source.appUIModelHash,
    "diagnostic.appUIModelHash",
    64,
  )!;
  if (!/^[a-f0-9]{64}$/u.test(appUIModelHash)) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      "diagnostic.appUIModelHash must be a lowercase SHA-256 hash.",
    );
  }
  const occurredAt = boundedString(
    source.occurredAt,
    "diagnostic.occurredAt",
    64,
  )!;
  if (!Number.isFinite(Date.parse(occurredAt))) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      "diagnostic.occurredAt must be an ISO date-time.",
    );
  }
  const errorMessage = optionalString(
    source.errorMessage,
    "diagnostic.errorMessage",
    2_000,
  );
  if (source.status === "error" && errorMessage === undefined) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      "An error diagnostic must include errorMessage.",
    );
  }

  return {
    schemaVersion: CREATOR_RUNTIME_DIAGNOSTIC_SCHEMA_VERSION,
    kind: source.kind,
    status: source.status,
    appUIModelHash,
    occurredAt,
    pluginId: boundedString(source.pluginId, "diagnostic.pluginId", 200)!,
    instanceId: boundedString(
      source.instanceId,
      "diagnostic.instanceId",
      200,
    )!,
    ...(optionalString(source.pluginName, "diagnostic.pluginName", 200) ===
    undefined
      ? {}
      : {
          pluginName: optionalString(
            source.pluginName,
            "diagnostic.pluginName",
            200,
          )!,
        }),
    ...(optionalString(source.slotId, "diagnostic.slotId", 200) === undefined
      ? {}
      : { slotId: optionalString(source.slotId, "diagnostic.slotId", 200)! }),
    ...(optionalString(source.slotPath, "diagnostic.slotPath", 1_000) ===
    undefined
      ? {}
      : {
          slotPath: optionalString(
            source.slotPath,
            "diagnostic.slotPath",
            1_000,
          )!,
        }),
    ...(errorMessage === undefined ? {} : { errorMessage }),
    ...(optionalString(
      source.componentStack,
      "diagnostic.componentStack",
      8_000,
    ) === undefined
      ? {}
      : {
          componentStack: optionalString(
            source.componentStack,
            "diagnostic.componentStack",
            8_000,
          )!,
        }),
  };
}

export function parseCreatorRuntimeComposition(
  input: unknown,
): CreatorRuntimeComposition {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      "composition must be an object.",
    );
  }
  const source = input as Record<string, unknown>;
  if (source.schemaVersion !== CREATOR_RUNTIME_COMPOSITION_SCHEMA_VERSION) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      `composition.schemaVersion must be ${CREATOR_RUNTIME_COMPOSITION_SCHEMA_VERSION}.`,
    );
  }
  const appUIModelHash = boundedString(
    source.appUIModelHash,
    "composition.appUIModelHash",
    64,
  )!;
  if (!/^[a-f0-9]{64}$/u.test(appUIModelHash)) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      "composition.appUIModelHash must be a lowercase SHA-256 hash.",
    );
  }
  const observedAt = boundedString(
    source.observedAt,
    "composition.observedAt",
    64,
  )!;
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      "composition.observedAt must be an ISO date-time.",
    );
  }
  if (!Array.isArray(source.instances)) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      "composition.instances must be an array.",
    );
  }
  if (source.instances.length > MAX_CREATOR_RUNTIME_COMPOSITION_INSTANCES) {
    throw new CreatorRuntimeDiagnosticSchemaError(
      `composition.instances exceeds ${MAX_CREATOR_RUNTIME_COMPOSITION_INSTANCES} entries.`,
    );
  }
  const seenInstanceIds = new Set<string>();
  const instances = source.instances.map((value, index) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new CreatorRuntimeDiagnosticSchemaError(
        `composition.instances[${index}] must be an object.`,
      );
    }
    const instance = value as Record<string, unknown>;
    const instanceId = boundedString(
      instance.instanceId,
      `composition.instances[${index}].instanceId`,
      200,
    )!;
    if (seenInstanceIds.has(instanceId)) {
      throw new CreatorRuntimeDiagnosticSchemaError(
        `composition.instances contains duplicate instanceId "${instanceId}".`,
      );
    }
    seenInstanceIds.add(instanceId);
    const slotPath = optionalString(
      instance.slotPath,
      `composition.instances[${index}].slotPath`,
      1_000,
    );
    return {
      instanceId,
      pluginId: boundedString(
        instance.pluginId,
        `composition.instances[${index}].pluginId`,
        200,
      )!,
      slotId: boundedString(
        instance.slotId,
        `composition.instances[${index}].slotId`,
        200,
      )!,
      ...(slotPath === undefined ? {} : { slotPath }),
    };
  });
  instances.sort(
    (left, right) =>
      left.slotId.localeCompare(right.slotId) ||
      left.instanceId.localeCompare(right.instanceId),
  );
  return {
    schemaVersion: CREATOR_RUNTIME_COMPOSITION_SCHEMA_VERSION,
    appUIModelHash,
    observedAt,
    instances,
  };
}

function scopeKey(projectId: string, threadId: string): string {
  return `${projectId}\u0000${threadId}`;
}

function diagnosticFingerprint(diagnostic: CreatorRuntimeDiagnostic): string {
  return JSON.stringify([
    diagnostic.kind,
    diagnostic.appUIModelHash,
    diagnostic.pluginId,
    diagnostic.instanceId,
    diagnostic.slotId ?? null,
    diagnostic.slotPath ?? null,
    diagnostic.errorMessage ?? null,
    diagnostic.componentStack ?? null,
  ]);
}

function recordId(fingerprint: string): string {
  return createHash("sha256").update(fingerprint).digest("hex").slice(0, 24);
}

function newestFirst(
  left: DiagnosticRecord,
  right: DiagnosticRecord,
): number {
  return right.lastSeenAt.localeCompare(left.lastSeenAt);
}

export class CreatorRuntimeDiagnosticStore {
  readonly #scopes = new Map<string, DiagnosticScope>();

  record(
    projectId: string,
    threadId: string,
    input: unknown,
  ): { accepted: true; resolvedCount: number } {
    boundedString(projectId, "projectId", 200);
    boundedString(threadId, "threadId", 200);
    const diagnostic = parseCreatorRuntimeDiagnostic(input);
    const now = new Date();
    const nowMs = now.getTime();
    const nowText = now.toISOString();
    this.#prune(nowMs);
    const scope = this.#getScope(scopeKey(projectId, threadId), nowMs);

    if (diagnostic.status === "resolved") {
      let resolvedCount = 0;
      scope.records.forEach((record) => {
        if (
          record.status === "error" &&
          record.kind === diagnostic.kind &&
          record.appUIModelHash === diagnostic.appUIModelHash &&
          record.pluginId === diagnostic.pluginId &&
          record.instanceId === diagnostic.instanceId
        ) {
          record.status = "resolved";
          record.lastSeenAt = nowText;
          record.resolvedAt = nowText;
          resolvedCount += 1;
        }
      });
      return { accepted: true, resolvedCount };
    }

    const fingerprint = diagnosticFingerprint(diagnostic);
    const existing = scope.records.find(
      (record) => diagnosticFingerprint(record) === fingerprint,
    );
    if (existing !== undefined) {
      existing.status = "error";
      existing.lastSeenAt = nowText;
      existing.occurredAt = diagnostic.occurredAt;
      existing.count += 1;
      delete existing.resolvedAt;
    } else {
      scope.records.push({
        ...diagnostic,
        id: recordId(fingerprint),
        firstSeenAt: nowText,
        lastSeenAt: nowText,
        count: 1,
      });
    }
    scope.records.sort(newestFirst);
    scope.records.splice(MAX_CREATOR_RUNTIME_DIAGNOSTICS_PER_SCOPE);
    return { accepted: true, resolvedCount: 0 };
  }

  recordComposition(
    projectId: string,
    threadId: string,
    input: unknown,
  ): { accepted: true } {
    boundedString(projectId, "projectId", 200);
    boundedString(threadId, "threadId", 200);
    const composition = parseCreatorRuntimeComposition(input);
    const nowMs = Date.now();
    this.#prune(nowMs);
    const scope = this.#getScope(scopeKey(projectId, threadId), nowMs);
    const sequence = scope.nextCompositionSequence;
    scope.nextCompositionSequence += 1;
    scope.compositionSnapshots.push({
      ...composition,
      receivedAt: new Date(nowMs).toISOString(),
      sequence,
    });
    scope.compositionSnapshots.sort(
      (left, right) =>
        Date.parse(right.observedAt) - Date.parse(left.observedAt) ||
        right.sequence - left.sequence,
    );
    scope.compositionSnapshots.splice(
      MAX_CREATOR_RUNTIME_COMPOSITIONS_PER_SCOPE,
    );
    return { accepted: true };
  }

  inspectComposition(
    projectId: string,
    threadId: string,
    currentAppUIModelHash: string,
  ): CreatorRuntimeCompositionInspection {
    boundedString(projectId, "projectId", 200);
    boundedString(threadId, "threadId", 200);
    boundedString(currentAppUIModelHash, "currentAppUIModelHash", 64);
    const nowMs = Date.now();
    this.#prune(nowMs);
    const scope = this.#scopes.get(scopeKey(projectId, threadId));
    if (scope !== undefined) {
      scope.lastAccessMs = nowMs;
    }
    const snapshot = scope?.compositionSnapshots[0];
    if (snapshot === undefined) {
      return {
        currentAppUIModelHash,
        runtimeStatus: "unavailable",
        synchronized: false,
        instances: [],
      };
    }
    const synchronized = snapshot.appUIModelHash === currentAppUIModelHash;
    return {
      currentAppUIModelHash,
      runtimeAppUIModelHash: snapshot.appUIModelHash,
      runtimeStatus: synchronized ? "synced" : "stale",
      synchronized,
      observedAt: snapshot.observedAt,
      receivedAt: snapshot.receivedAt,
      instances: snapshot.instances,
    };
  }

  inspect(
    projectId: string,
    threadId: string,
    currentAppUIModelHash: string,
    options: { includeStale?: boolean | undefined } = {},
  ): CreatorRuntimeDiagnosticInspection {
    const nowMs = Date.now();
    this.#prune(nowMs);
    const scope = this.#scopes.get(scopeKey(projectId, threadId));
    if (scope !== undefined) {
      scope.lastAccessMs = nowMs;
    }
    const records = [...(scope?.records ?? [])].sort(newestFirst);
    const current = records.filter(
      (record) => record.appUIModelHash === currentAppUIModelHash,
    );
    const stale = records.filter(
      (record) => record.appUIModelHash !== currentAppUIModelHash,
    );
    const currentErrors = current.filter((record) => record.status === "error");
    const resolvedCurrent = current.filter(
      (record) => record.status === "resolved",
    );
    const staleOpenCount = stale.filter(
      (record) => record.status === "error",
    ).length;
    const staleResolvedCount = stale.length - staleOpenCount;
    const selectedStale = options.includeStale === true ? stale : [];
    const selected = [
      ...currentErrors,
      ...resolvedCurrent,
      ...selectedStale,
    ];
    const truncated = selected.length > MAX_CREATOR_RUNTIME_DIAGNOSTIC_RESULTS;
    const convert = (
      record: DiagnosticRecord,
      isStale: boolean,
    ): StoredCreatorRuntimeDiagnostic => ({
      ...record,
      stale: isStale,
    });

    return {
      available: true,
      currentAppUIModelHash,
      currentErrors: currentErrors
        .slice(0, MAX_CREATOR_RUNTIME_DIAGNOSTIC_RESULTS)
        .map((record) => convert(record, false)),
      resolvedCurrent: resolvedCurrent
        .slice(0, MAX_CREATOR_RUNTIME_DIAGNOSTIC_RESULTS)
        .map((record) => convert(record, false)),
      stale: selectedStale
        .slice(0, MAX_CREATOR_RUNTIME_DIAGNOSTIC_RESULTS)
        .map((record) => convert(record, true)),
      summary: {
        currentOpenCount: currentErrors.length,
        resolvedCurrentCount: resolvedCurrent.length,
        staleOpenCount,
        staleResolvedCount,
        ...(records[0] === undefined
          ? {}
          : { latestAt: records[0].lastSeenAt }),
        truncated,
      },
    };
  }

  #getScope(key: string, nowMs: number): DiagnosticScope {
    const existing = this.#scopes.get(key);
    if (existing !== undefined) {
      existing.lastAccessMs = nowMs;
      return existing;
    }
    const scope: DiagnosticScope = {
      lastAccessMs: nowMs,
      records: [],
      compositionSnapshots: [],
      nextCompositionSequence: 0,
    };
    this.#scopes.set(key, scope);
    if (this.#scopes.size > MAX_CREATOR_RUNTIME_DIAGNOSTIC_SCOPES) {
      const oldest = [...this.#scopes.entries()].sort(
        (left, right) => left[1].lastAccessMs - right[1].lastAccessMs,
      )[0];
      if (oldest !== undefined) {
        this.#scopes.delete(oldest[0]);
      }
    }
    return scope;
  }

  #prune(nowMs: number): void {
    for (const [key, scope] of this.#scopes) {
      if (nowMs - scope.lastAccessMs > CREATOR_RUNTIME_DIAGNOSTIC_TTL_MS) {
        this.#scopes.delete(key);
      }
    }
  }
}

export function createCreatorRuntimeDiagnosticProjectId(
  projectRoot: string,
): string {
  return createHash("sha256").update(projectRoot).digest("hex");
}

export class CreatorRuntimeDiagnosticSession {
  #threadId: string | undefined;

  constructor(
    private readonly store: CreatorRuntimeDiagnosticStore,
    private readonly projectId: string,
  ) {}

  beginThread(threadId: string): void {
    this.#threadId = threadId;
  }

  inspect(
    currentAppUIModelHash: string,
    options: { includeStale?: boolean | undefined } = {},
  ): CreatorRuntimeDiagnosticInspection {
    if (this.#threadId === undefined) {
      return {
        available: true,
        currentAppUIModelHash,
        currentErrors: [],
        resolvedCurrent: [],
        stale: [],
        summary: {
          currentOpenCount: 0,
          resolvedCurrentCount: 0,
          staleOpenCount: 0,
          staleResolvedCount: 0,
          truncated: false,
        },
      };
    }
    return this.store.inspect(
      this.projectId,
      this.#threadId,
      currentAppUIModelHash,
      options,
    );
  }

  inspectComposition(
    currentAppUIModelHash: string,
  ): CreatorRuntimeCompositionInspection {
    if (this.#threadId === undefined) {
      return {
        currentAppUIModelHash,
        runtimeStatus: "unavailable",
        synchronized: false,
        instances: [],
      };
    }
    return this.store.inspectComposition(
      this.projectId,
      this.#threadId,
      currentAppUIModelHash,
    );
  }

  async waitForComposition(
    expectedAppUIModelHash: string,
    timeoutMs: number,
  ): Promise<CreatorRuntimeCompositionInspection> {
    const deadline = Date.now() + timeoutMs;
    let inspection = this.inspectComposition(expectedAppUIModelHash);
    while (!inspection.synchronized && Date.now() < deadline) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.min(50, Math.max(0, deadline - Date.now())));
      });
      inspection = this.inspectComposition(expectedAppUIModelHash);
    }
    return inspection;
  }

  summary(currentAppUIModelHash: string): CreatorRuntimeDiagnosticSummary {
    const inspection = this.inspect(currentAppUIModelHash);
    return {
      available: true,
      currentOpenCount: inspection.summary.currentOpenCount,
      resolvedCurrentCount: inspection.summary.resolvedCurrentCount,
      staleOpenCount: inspection.summary.staleOpenCount,
      ...(inspection.summary.latestAt === undefined
        ? {}
        : { latestAt: inspection.summary.latestAt }),
    };
  }
}
