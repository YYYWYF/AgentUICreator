import type { ConversationToolCallProps } from "@agent-ui/react";

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
  readonly eligibleParts: readonly unknown[];
}

export type SubagentToolCallPart = Pick<
  ConversationToolCallProps,
  "type" | "toolCallId" | "toolName" | "args" | "result" | "isError" | "status"
>;

export interface SubagentToolCallsProjection {
  readonly view: SubagentListViewModel | null;
  readonly eligibleToolCallIds: readonly string[];
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
  if (parts === undefined) {
    return { view: null, ineligibleParts: [], eligibleParts: [] };
  }

  const ineligibleParts: unknown[] = [];
  const eligibleParts: unknown[] = [];
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
    eligibleParts.push(part);
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
    return { view: null, ineligibleParts, eligibleParts };
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
    eligibleParts,
  };
}

/** Strict aggregate projection: any malformed part falls back to raw UI. */
export function projectSubagentList(
  value: unknown,
): SubagentListViewModel | null {
  const projected = projectSubagentParts(value);
  return projected.ineligibleParts.length === 0 ? projected.view : null;
}

export interface ProjectedSubagentToolCall {
  readonly toolCallId: string;
  readonly name: unknown;
  readonly model: unknown;
  readonly status: "error" | "running" | "completed" | undefined;
  readonly progress: unknown;
}

/** Normalizes one conversation tool call into the shared projection shape. */
export function projectSubagentToolCall(
  part: SubagentToolCallPart,
): ProjectedSubagentToolCall {
  const args = asRecord(part.args);
  const result = asRecord(part.result);
  const source = result ?? args;
  const name = result?.name ?? args?.name;
  const model = result?.model ?? args?.model;
  const explicitStatus = result?.status ?? args?.status;
  const partStatus = part.status?.type;
  const status = part.isError === true ||
      partStatus === "requires-action" ||
      partStatus === "incomplete"
    ? "error"
    : explicitStatus === "running"
    ? "running"
    : explicitStatus === "completed" || explicitStatus === "complete"
    ? "completed"
    : partStatus === "complete"
    ? "completed"
    : partStatus === "running"
    ? "running"
    : undefined;

  return {
    toolCallId: part.toolCallId,
    name,
    model,
    status,
    progress: result?.progress ?? args?.progress ?? source?.progress,
  };
}

/** Uses the same field and lifecycle rules as the aggregate projection. */
export function isEligibleSubagentToolCall(
  part: SubagentToolCallPart,
): boolean {
  const projected = projectSubagentParts([projectSubagentToolCall(part)]);
  return projected.view !== null && projected.ineligibleParts.length === 0;
}

/** Projects one message's real dispatch tool calls into one aggregate view. */
export function projectSubagentToolCalls(
  parts: readonly SubagentToolCallPart[],
): SubagentToolCallsProjection {
  const projected = projectSubagentParts(parts.map(projectSubagentToolCall));
  const eligibleToolCallIds = projected.eligibleParts.flatMap((part) => {
    const toolCallId = asRecord(part)?.toolCallId;
    return typeof toolCallId === "string" ? [toolCallId] : [];
  });

  return {
    view: projected.view,
    eligibleToolCallIds,
  };
}
