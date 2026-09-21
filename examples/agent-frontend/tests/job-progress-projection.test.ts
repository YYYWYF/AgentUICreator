import { describe, expect, it } from "vitest";

import {
  projectJobProgressState,
  projectRunCiJobArgs,
} from "../agent-ui/conversation/state/job-progress-projection";

const validArgs = {
  target: "Verify the current change on CI",
  stages: [
    { name: "clone", weight: 1 },
    { name: "install", weight: 3 },
  ] as const,
};

const validState = {
  stageIndex: 0,
  stageProgress: 0.1,
  eta: "about 4 min",
};

describe("JobProgress state projection", () => {
  it("projects dynamic state by toolCallId", () => {
    expect(projectJobProgressState({
      jobs: { "ci-job-1": validState },
    }, "ci-job-1")).toEqual(validState);
  });

  it("ignores other jobs and unknown toolCallIds", () => {
    expect(projectJobProgressState({
      jobs: {
        "other-job": validState,
      },
    }, "ci-job-1")).toBeNull();
  });

  it("returns null when progress state is missing or invalid", () => {
    expect(projectJobProgressState({ other: true }, "ci-job-1")).toBeNull();
    expect(projectJobProgressState(undefined, "ci-job-1")).toBeNull();
    expect(projectJobProgressState({
      jobs: { "ci-job-1": { ...validState, stageIndex: Number.NaN } },
    }, "ci-job-1")).toBeNull();
    expect(projectJobProgressState({
      jobs: { "ci-job-1": { ...validState, stageProgress: Number.POSITIVE_INFINITY } },
    }, "ci-job-1")).toBeNull();
  });

  it("projects static Tool args separately", () => {
    expect(projectRunCiJobArgs(validArgs)).toEqual(validArgs);
    expect(projectRunCiJobArgs({
      target: "",
      stages: validArgs.stages,
    })).toBeNull();
    expect(projectRunCiJobArgs({
      target: validArgs.target,
      stages: [{ name: "clone", weight: "1" }],
    })).toBeNull();
    expect(projectRunCiJobArgs({
      target: validArgs.target,
      stages: [{ name: "", weight: 1 }],
    })).toBeNull();
  });

  it("ignores unrelated state fields without inventing presentation data", () => {
    expect(projectJobProgressState({
      requestId: "run-1",
      jobs: { "ci-job-1": { ...validState, backendOnly: { traceId: "trace-1" } } },
    }, "ci-job-1")).toEqual(validState);
  });
});
