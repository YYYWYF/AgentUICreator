import { describe, expect, it } from "vitest";

import {
  creatorStageTitle,
  parseCreatorStepMetadata,
  projectCreatorIntentStage,
} from "../src/ui/creatorStageProjection.js";

function productizedStage(creator: Record<string, unknown>) {
  return projectCreatorIntentStage(undefined, {
    kind: "finished",
    name: "creator.productized-operation",
    metadata: { creator },
  });
}

describe("Creator productized completion presentation", () => {
  it("keeps request completion green when static validation fails", () => {
    const stage = productizedStage({
      status: "success",
      staticStatus: "failed",
      runtimeStatus: "not-run",
      postconditionStatus: "passed",
      postconditionKind: "instance_absent",
      postconditionEvidence: "The requested instance is absent.",
    });

    expect(stage?.metadata).toMatchObject({
      postconditionStatus: "passed",
      postconditionKind: "instance_absent",
      postconditionEvidence: "The requested instance is absent.",
    });
    expect(creatorStageTitle(stage!)).toBe(
      "请求的修改已完成，静态验证未通过",
    );
  });

  it("does not call an unconfirmed request verified when Runtime passed", () => {
    const stage = productizedStage({
      status: "committed_unverified",
      staticStatus: "passed",
      runtimeStatus: "passed",
      postconditionStatus: "unavailable",
    });

    expect(creatorStageTitle(stage!)).toBe(
      "修改已提交，但无法确认请求结果",
    );
    expect(creatorStageTitle(stage!)).not.toBe("已应用并验证修改");
  });

  it("reports a stale Runtime while retaining completed request status", () => {
    const stage = productizedStage({
      status: "success",
      staticStatus: "passed",
      runtimeStatus: "stale",
      postconditionStatus: "passed",
    });

    expect(creatorStageTitle(stage!)).toBe(
      "请求的修改已完成，Runtime 尚未观测到最新状态",
    );
  });

  it("reports a request that was already satisfied", () => {
    const stage = productizedStage({
      status: "already_satisfied",
      postconditionStatus: "passed",
    });

    expect(creatorStageTitle(stage!)).toBe("当前状态已满足，无需修改");
  });

  it("accepts only the declared postcondition metadata values", () => {
    expect(
      parseCreatorStepMetadata({
        creator: {
          postconditionStatus: "unavailable",
          postconditionKind: "placement",
          postconditionEvidence: "Persisted placement could not be read.",
        },
      }),
    ).toMatchObject({
      postconditionStatus: "unavailable",
      postconditionKind: "placement",
      postconditionEvidence: "Persisted placement could not be read.",
    });

    expect(
      parseCreatorStepMetadata({
        creator: {
          postconditionStatus: "maybe",
          postconditionKind: "entire_model",
          postconditionEvidence: 12,
        },
      }),
    ).toEqual({});
  });
});
