import { describe, expect, it } from "vitest";

import { projectJobProgressState } from "../agent-ui/conversation/state/job-progress-projection";

const validJob = {
  id: "ci-verification",
  title: "Verify the current change on CI",
  stages: [
    { name: "clone", weight: 1 },
    { name: "install", weight: 3 },
  ],
  stageIndex: 0,
  stageProgress: 0.1,
  eta: "about 4 min",
};

describe("JobProgress state projection", () => {
  it("projects the semantic JobProgress view model", () => {
    expect(projectJobProgressState({ jobProgress: validJob })).toEqual(validJob);
  });

  it("returns null when jobProgress is missing", () => {
    expect(projectJobProgressState({ other: true })).toBeNull();
    expect(projectJobProgressState(undefined)).toBeNull();
  });

  it("returns null when a stage is invalid", () => {
    expect(projectJobProgressState({
      jobProgress: { ...validJob, stages: [{ name: "clone", weight: "1" }] },
    })).toBeNull();
  });

  it("returns null when progress numbers are not finite", () => {
    expect(projectJobProgressState({
      jobProgress: { ...validJob, stageIndex: Number.NaN },
    })).toBeNull();
    expect(projectJobProgressState({
      jobProgress: { ...validJob, stageProgress: Number.POSITIVE_INFINITY },
    })).toBeNull();
  });

  it("ignores unrelated state fields without inventing presentation data", () => {
    expect(projectJobProgressState({
      requestId: "run-1",
      jobProgress: { ...validJob, backendOnly: { traceId: "trace-1" } },
    })).toEqual(validJob);
  });
});
