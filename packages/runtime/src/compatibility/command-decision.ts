import type { AgentExecution } from "@za38.03/agent-ui-core";
import type { ConversationCommandDecisionRequest } from "@za38.03/agent-ui-plugins";

const hiddenOnInterruptDecisions = new Set(["edit", "respond"]);

export interface OnInterruptCommandRequest {
  actionName: string;
  args: unknown;
  decisionRequest: ConversationCommandDecisionRequest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodePayload(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/** Project the legacy CUSTOM payload into product-owned decision requests. */
export function parseOnInterruptCommandRequests(
  value: unknown,
): OnInterruptCommandRequest[] | undefined {
  const payload = decodePayload(value);
  if (!isRecord(payload) || !Array.isArray(payload.action_requests) || !Array.isArray(payload.review_configs)) {
    return undefined;
  }

  const decisionsByAction = new Map<string, string[]>();
  for (const item of payload.review_configs) {
    if (!isRecord(item) || typeof item.action_name !== "string" || !Array.isArray(item.allowed_decisions)) continue;
    if (!item.allowed_decisions.every((decision): decision is string => typeof decision === "string")) continue;
    if (item.allowed_decisions.length === 0) continue;
    decisionsByAction.set(item.action_name, [...item.allowed_decisions]);
  }

  const requests: OnInterruptCommandRequest[] = [];
  for (const item of payload.action_requests) {
    if (!isRecord(item) || typeof item.name !== "string") continue;
    const backendDecisions = decisionsByAction.get(item.name);
    if (backendDecisions === undefined) continue;
    const allowedDecisions = backendDecisions.filter(
      (decision) => !hiddenOnInterruptDecisions.has(decision),
    );
    if (allowedDecisions.length === 0) continue;
    requests.push({
      actionName: item.name,
      args: item.args,
      decisionRequest: {
        ...(typeof item.description === "string" ? { description: item.description } : {}),
        allowedDecisions,
      },
    });
  }
  return requests;
}

function stableJson(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") {
    try { return JSON.stringify(value); } catch { return undefined; }
  }
  if (Array.isArray(value)) {
    const entries = value.map(stableJson);
    if (entries.some(entry => entry === undefined)) return undefined;
    return `[${entries.join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record).sort().map(key => {
    const serialized = stableJson(record[key]);
    return serialized === undefined ? undefined : `${JSON.stringify(key)}:${serialized}`;
  });
  if (entries.some(entry => entry === undefined)) return undefined;
  return `{${entries.join(",")}}`;
}

function parseToolArguments(value: string): unknown {
  try { return JSON.parse(value) as unknown; }
  catch { return undefined; }
}

/** Match by tool name and canonical arguments; ambiguous matches stay unbound. */
export function matchOnInterruptToolCall(
  request: OnInterruptCommandRequest,
  executions: readonly AgentExecution[],
  excludedToolCallIds: ReadonlySet<string>,
): string | undefined {
  const candidates = executions.filter(
    (execution): execution is Extract<AgentExecution, { type: "tool" }> =>
      execution.type === "tool" &&
      execution.status === "awaiting-result" &&
      execution.name === request.actionName &&
      !excludedToolCallIds.has(execution.id),
  );
  if (request.args === undefined) {
    return candidates.length === 1 ? candidates[0]!.id : undefined;
  }

  const expected = stableJson(request.args);
  if (expected === undefined) return undefined;
  const exact = candidates.filter((execution) =>
    stableJson(parseToolArguments(execution.arguments)) === expected,
  );
  return exact.length === 1 ? exact[0]!.id : undefined;
}
