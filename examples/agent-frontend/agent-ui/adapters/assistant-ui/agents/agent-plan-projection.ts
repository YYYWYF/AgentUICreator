export interface AgentPlanViewModel {
  readonly steps: readonly string[];
  readonly activeIndex: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

/** Projects an untrusted plan payload without inventing a plan on failure. */
export function projectAgentPlan(value: unknown): AgentPlanViewModel | null {
  const record = asRecord(value);
  if (record === undefined || !Array.isArray(record.steps)) return null;

  if (
    typeof record.activeIndex !== "number" ||
    !Number.isFinite(record.activeIndex)
  ) {
    return null;
  }

  const steps = record.steps.filter(
    (step): step is string =>
      typeof step === "string" && step.trim().length > 0,
  );

  return {
    steps,
    activeIndex: Math.trunc(record.activeIndex),
  };
}
