import type { JobProgressStage } from "@agent-ui/react";

export interface JobProgressRuntimeState {
  readonly stageIndex: number;
  readonly stageProgress: number;
  readonly eta: string;
}

export interface RunCiJobArgs {
  readonly target: string;
  readonly stages: readonly JobProgressStage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function projectJobProgressState(
  state: unknown,
  toolCallId: string,
): JobProgressRuntimeState | null {
  if (!isRecord(state) || !isRecord(state.jobs)) return null;

  const job = state.jobs[toolCallId];
  if (
    !isRecord(job) ||
    !isFiniteNumber(job.stageIndex) ||
    !isFiniteNumber(job.stageProgress) ||
    typeof job.eta !== "string"
  ) {
    return null;
  }

  return {
    stageIndex: job.stageIndex,
    stageProgress: job.stageProgress,
    eta: job.eta,
  };
}

export function projectRunCiJobArgs(args: unknown): RunCiJobArgs | null {
  if (!isRecord(args)) return null;
  const target = args.target;
  if (typeof target !== "string" || target.trim() === "") {
    return null;
  }
  if (!Array.isArray(args.stages)) return null;

  const stages: JobProgressStage[] = [];
  for (const stage of args.stages) {
    if (
      !isRecord(stage) ||
      typeof stage.name !== "string" ||
      stage.name.trim() === "" ||
      !isFiniteNumber(stage.weight)
    ) {
      return null;
    }
    stages.push({ name: stage.name, weight: stage.weight });
  }

  return { target, stages };
}
