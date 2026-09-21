import type { JobProgressStage } from "@agent-ui/react";

export interface JobProgressViewModel {
  readonly id: string;
  readonly title: string;
  readonly stages: readonly JobProgressStage[];
  readonly stageIndex: number;
  readonly stageProgress: number;
  readonly eta: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function projectJobProgressState(
  state: unknown,
): JobProgressViewModel | null {
  if (!isRecord(state) || !isRecord(state.jobProgress)) return null;

  const job = state.jobProgress;
  if (
    typeof job.id !== "string" ||
    typeof job.title !== "string" ||
    !Array.isArray(job.stages) ||
    !isFiniteNumber(job.stageIndex) ||
    !isFiniteNumber(job.stageProgress) ||
    typeof job.eta !== "string"
  ) {
    return null;
  }

  const stages: JobProgressStage[] = [];
  for (const stage of job.stages) {
    if (
      !isRecord(stage) ||
      typeof stage.name !== "string" ||
      !isFiniteNumber(stage.weight)
    ) {
      return null;
    }
    stages.push({ name: stage.name, weight: stage.weight });
  }

  return {
    id: job.id,
    title: job.title,
    stages,
    stageIndex: job.stageIndex,
    stageProgress: job.stageProgress,
    eta: job.eta,
  };
}
