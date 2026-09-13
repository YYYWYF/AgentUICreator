export interface SubagentListViewModel {
  readonly agents: readonly {
    readonly name: string;
    readonly model: string;
  }[];
  readonly progress: readonly number[];
  readonly completedCount: number;
  readonly showSummary: boolean;
  readonly summaryAgent: {
    readonly name: string;
    readonly model: string;
  };
}

export interface SubagentPartsProjection {
  readonly view: SubagentListViewModel | null;
  readonly ineligibleParts: readonly unknown[];
}

interface ValidSubagent {
  readonly name: string;
  readonly model: string;
  readonly complete: boolean;
  readonly progress: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function isCompleteStatus(value: unknown): boolean {
  return value === "complete" || value === "completed";
}

function isRunningStatus(value: unknown): boolean {
  return value === "running";
}

function projectProgress(value: unknown, complete: boolean): number {
  if (value === undefined) return complete ? 100 : 0;
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function readParts(value: unknown): readonly unknown[] | undefined {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (record === undefined) return undefined;
  if (Array.isArray(record.parts)) return record.parts;
  if (Array.isArray(record.agents)) return record.agents;
  return undefined;
}

function readSummary(
  value: unknown,
): { showSummary: boolean; summaryAgent: SubagentListViewModel["summaryAgent"] } | null {
  const record = asRecord(value);
  const showSummary = record?.showSummary === true;
  if (!showSummary) {
    return {
      showSummary: false,
      summaryAgent: { name: "", model: "" },
    };
  }

  const summary = asRecord(record?.summaryAgent);
  const name = nonEmptyString(summary?.name);
  const model = nonEmptyString(summary?.model);
  if (name === undefined || model === undefined) return null;
  return { showSummary: true, summaryAgent: { name, model } };
}

/**
 * Projects the eligible parts of one assistant message. The caller can keep
 * `ineligibleParts` on the normal ToolFallback path instead of hiding errors
 * or approval states inside the aggregate.
 */
export function projectSubagentParts(value: unknown): SubagentPartsProjection {
  const parts = readParts(value);
  if (parts === undefined) return { view: null, ineligibleParts: [] };

  const ineligibleParts: unknown[] = [];
  const agents: ValidSubagent[] = [];
  const names = new Set<string>();

  for (const part of parts) {
    const record = asRecord(part);
    const name = nonEmptyString(record?.name);
    const model = nonEmptyString(record?.model);
    const complete = isCompleteStatus(record?.status);
    if (
      record === undefined ||
      name === undefined ||
      model === undefined ||
      (!complete && !isRunningStatus(record.status)) ||
      names.has(name)
    ) {
      ineligibleParts.push(part);
      continue;
    }

    names.add(name);
    agents.push({
      name,
      model,
      complete,
      progress: projectProgress(record.progress, complete),
    });
  }

  const summary = readSummary(value);
  if (summary === null) {
    const record = asRecord(value);
    ineligibleParts.push(record?.summaryAgent);
  }

  if (agents.length === 0 || summary === null) {
    return { view: null, ineligibleParts };
  }

  let completedCount = 0;
  for (const agent of agents) {
    if (!agent.complete) break;
    completedCount += 1;
  }

  return {
    view: {
      agents: agents.map(({ name, model }) => ({ name, model })),
      progress: agents.map((agent) => agent.progress),
      completedCount,
      showSummary: summary.showSummary,
      summaryAgent: summary.summaryAgent,
    },
    ineligibleParts,
  };
}

/** Strict aggregate projection: any malformed part falls back to raw UI. */
export function projectSubagentList(
  value: unknown,
): SubagentListViewModel | null {
  const projected = projectSubagentParts(value);
  return projected.ineligibleParts.length === 0 ? projected.view : null;
}
