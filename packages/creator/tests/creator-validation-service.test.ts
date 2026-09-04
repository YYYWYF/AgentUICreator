import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CREATOR_COMPLETION_VALIDATIONS,
  CreatorActivityRecorder,
  CreatorValidationService,
  type CreatorCommandExecutor,
  type CreatorKnownCommand,
} from "../src/index.js";

const temporaryProjects: string[] = [];

async function createProject(): Promise<string> {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "creator-validation-service-"),
  );
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    "{}\n",
  );
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

function fakeRunner(
  activity: CreatorActivityRecorder,
  calls: CreatorKnownCommand[],
  resultFor: (
    command: CreatorKnownCommand,
  ) => { output: string; exitCode: number | null; truncated: boolean },
  afterStart?: (command: CreatorKnownCommand) => void,
): CreatorCommandExecutor {
  return {
    async executeKnownCommand(command) {
      calls.push(command);
      const revision = activity.revision;
      const result = resultFor(command);
      afterStart?.(command);
      activity.recordValidation(command, result, revision);
      return result;
    },
  };
}

describe("CreatorValidationService", () => {
  it("executes both missing validations in the required order without changing revision", async () => {
    const projectRoot = await createProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const calls: CreatorKnownCommand[] = [];
    const logEvents: string[] = [];
    activity.begin("missing-validations");
    activity.touch("/project/app-ui/app-ui.json");
    const beforeRevision = activity.revision;
    const service = new CreatorValidationService({
      projectRoot,
      activity,
      runner: fakeRunner(activity, calls, () => ({
        output: "ok",
        exitCode: 0,
        truncated: false,
      })),
      runLogger: {
        async record(type) {
          logEvents.push(type);
        },
      },
    });

    const result = await service.ensureCurrentRevisionValidated();

    expect(calls).toEqual([...CREATOR_COMPLETION_VALIDATIONS]);
    expect(result).toMatchObject({
      revision: beforeRevision,
      status: "passed",
      checks: [
        { command: "pnpm verify:ui", source: "executed" },
        { command: "pnpm typecheck", source: "executed" },
      ],
    });
    expect(activity.revision).toBe(beforeRevision);
    expect(logEvents).toEqual([
      "host_validation_started",
      "host_validation_finished",
    ]);
  });

  it("reuses complete current-revision evidence without executing commands", async () => {
    const projectRoot = await createProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const calls: CreatorKnownCommand[] = [];
    activity.begin("cached-validations");
    for (const command of CREATOR_COMPLETION_VALIDATIONS) {
      activity.recordValidation(command, {
        output: "cached ok",
        exitCode: 0,
        truncated: false,
      });
    }
    const service = new CreatorValidationService({
      projectRoot,
      activity,
      runner: fakeRunner(activity, calls, () => ({
        output: "unexpected",
        exitCode: 1,
        truncated: false,
      })),
    });

    const result = await service.ensureCurrentRevisionValidated();

    expect(calls).toEqual([]);
    expect(result.status).toBe("passed");
    expect(result.checks.map((check) => check.source)).toEqual([
      "cached",
      "cached",
    ]);
  });

  it("executes only missing current-revision evidence and never reuses an old revision", async () => {
    const projectRoot = await createProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const calls: CreatorKnownCommand[] = [];
    activity.begin("partial-validations");
    activity.recordValidation("pnpm typecheck", {
      output: "old ok",
      exitCode: 0,
      truncated: false,
    });
    activity.touch("/project/app-ui/app-ui.json");
    activity.recordValidation("pnpm verify:ui", {
      output: "current ok",
      exitCode: 0,
      truncated: false,
    });
    const service = new CreatorValidationService({
      projectRoot,
      activity,
      runner: fakeRunner(activity, calls, () => ({
        output: "new ok",
        exitCode: 0,
        truncated: false,
      })),
    });

    const result = await service.ensureCurrentRevisionValidated();

    expect(calls).toEqual(["pnpm typecheck"]);
    expect(result.status).toBe("passed");
    expect(result.checks.map((check) => check.source)).toEqual([
      "cached",
      "executed",
    ]);
    expect(result.checks[1]?.revision).toBe(1);
  });

  it("returns bounded failure evidence", async () => {
    const projectRoot = await createProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const calls: CreatorKnownCommand[] = [];
    activity.begin("failed-validation");
    const service = new CreatorValidationService({
      projectRoot,
      activity,
      runner: fakeRunner(activity, calls, (command) => ({
        output: command === "pnpm typecheck" ? "x".repeat(30_000) : "ok",
        exitCode: command === "pnpm typecheck" ? 1 : 0,
        truncated: false,
      })),
    });

    const result = await service.ensureCurrentRevisionValidated();

    expect(result.status).toBe("failed");
    expect(result.checks[1]).toMatchObject({
      command: "pnpm typecheck",
      status: "failed",
      exitCode: 1,
      revision: 0,
      truncated: true,
    });
    expect(result.checks[1]?.output.length).toBeLessThan(30_000);
  });

  it("returns stale when mutation revision changes during validation", async () => {
    const projectRoot = await createProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const calls: CreatorKnownCommand[] = [];
    activity.begin("stale-validation");
    const service = new CreatorValidationService({
      projectRoot,
      activity,
      runner: fakeRunner(
        activity,
        calls,
        () => ({ output: "ok", exitCode: 0, truncated: false }),
        () => activity.touch("/project/app-ui/app-ui.json"),
      ),
    });

    const result = await service.ensureCurrentRevisionValidated();

    expect(result).toMatchObject({ revision: 0, status: "stale" });
    expect(calls).toEqual(["pnpm verify:ui"]);
    expect(activity.validationAtRevision("pnpm verify:ui", 0)).toBeDefined();
    expect(activity.validationAtCurrentRevision("pnpm verify:ui")).toBeUndefined();
  });
});
