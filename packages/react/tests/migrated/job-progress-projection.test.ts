import { describe, expect, it } from "vitest";

import {
  projectJobProgressState,
  projectRunCiJobResult,
  projectRunCiJobArgs,
} from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/state/job-progress-projection";

const validArgs = {
  target: "Verify the current change on CI",
  stages: [
    { name: "clone", weight: 1, description: "Fetch source." },
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
    expect(projectRunCiJobArgs({
      target: validArgs.target,
      stages: [{ name: "clone", weight: 1, description: false }],
    })).toBeNull();
  });

  it("projects explicit Tool Result outcomes and elapsed time", () => {
    expect(projectRunCiJobResult({ success: true, summary: "All CI stages passed", elapsedMs: 42 }))
      .toEqual({ outcome: { status: "success", summary: "All CI stages passed" }, elapsedMs: 42 });
    expect(projectRunCiJobResult(JSON.stringify({ success: false, summary: "Build failed" })))
      .toEqual({ outcome: { status: "failed", summary: "Build failed" } });
    expect(projectRunCiJobResult({ outcome: { status: "partial", summary: "Two checks skipped" } }))
      .toEqual({ outcome: { status: "partial", summary: "Two checks skipped" } });
    expect(projectRunCiJobResult({ status: "cancelled", summary: "Stopped by request" }))
      .toEqual({ outcome: { status: "cancelled", summary: "Stopped by request" } });
  });

  it("does not infer a terminal outcome from completed stage indices", () => {
    expect(projectRunCiJobResult(undefined)).toEqual({ outcome: null });
    expect(projectRunCiJobResult({ stageIndex: 2, stageProgress: 1 })).toEqual({ outcome: null });
  });

  it("ignores unrelated state fields without inventing presentation data", () => {
    expect(projectJobProgressState({
      requestId: "run-1",
      jobs: { "ci-job-1": { ...validState, backendOnly: { traceId: "trace-1" } } },
    }, "ci-job-1")).toEqual(validState);
  });
});
