export const AGENT_PLAN_ACTIVITY_TYPE = "agent-plan";

export interface AgentPlanActivityStep {
  readonly id?: string | undefined;
  readonly label: string;
  readonly description?: string | undefined;
}

export interface AgentPlanActivity {
  readonly title?: string | undefined;
  readonly steps: readonly AgentPlanActivityStep[];
  readonly activeIndex: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Projects only a complete, explicit Agent Plan activity payload. */
export function projectAgentPlanActivity(value: unknown): AgentPlanActivity | null {
  if (!isRecord(value) || !Array.isArray(value.steps)) return null;
  if (
    value.title !== undefined &&
    typeof value.title !== "string"
  ) {
    return null;
  }
  if (
    typeof value.activeIndex !== "number" ||
    !Number.isInteger(value.activeIndex) ||
    value.activeIndex < 0 ||
    value.activeIndex > value.steps.length
  ) {
    return null;
  }

  const steps: AgentPlanActivityStep[] = [];
  for (const valueStep of value.steps) {
    if (
      !isRecord(valueStep) ||
      typeof valueStep.label !== "string" ||
      valueStep.label.trim().length === 0
    ) {
      return null;
    }
    if (
      valueStep.id !== undefined &&
      (typeof valueStep.id !== "string" || valueStep.id.trim().length === 0)
    ) {
      return null;
    }
    if (
      valueStep.description !== undefined &&
      typeof valueStep.description !== "string"
    ) {
      return null;
    }

    steps.push({
      ...(valueStep.id === undefined ? {} : { id: valueStep.id }),
      label: valueStep.label,
      ...(valueStep.description === undefined
        ? {}
        : { description: valueStep.description }),
    });
  }

  return {
    ...(value.title === undefined ? {} : { title: value.title }),
    steps,
    activeIndex: value.activeIndex,
  };
}
