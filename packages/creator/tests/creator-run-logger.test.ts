import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { AIMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { RunAgentInputSchema } from "@ag-ui/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  CreatorActivityRecorder,
  CreatorAgUiAdapter,
  CreatorRunLogger,
  createCreatorAgent,
  type CreatorRunReceipt,
} from "../src/index.js";

const temporaryProjects: string[] = [];

async function createTemporaryProject(): Promise<string> {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "agent-ui-creator-run-log-"),
  );
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    JSON.stringify({
      version: "2",
      root: {
        type: "slot",
        id: "main-slot",
        slotId: "main",
      },
      pluginInstances: {},
    }),
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

describe("CreatorRunLogger", () => {
  it("records the model, tool, receipt, and gate-facing run chain as JSONL", async () => {
    const projectRoot = await createTemporaryProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const runLogger = new CreatorRunLogger({
      projectRoot,
      modelName: "mimo-v2.5-pro",
    });
    const model = fakeModel()
      .respondWithTools([
        {
          name: "read_file",
          args: { file_path: "/project/app-ui/app-ui.json" },
        },
      ])
      .respondWithTools([
        {
          name: "edit_file",
          args: {
            file_path: "/project/app-ui/app-ui.json",
            old_string: '"pluginInstances":{}',
            new_string: '"pluginInstances":{"history-main":{"id":"history-main","pluginId":"history","enabled":true,"mount":{"slotId":"main"}}}',
            replace_all: false,
          },
        },
      ])
      .respond(new AIMessage("历史会话入口已更新。"));
    const agent = createCreatorAgent({
      model,
      projectRoot,
      activity,
      completionGate: false,
      runLogger,
    });
    const adapter = new CreatorAgUiAdapter(agent, activity, runLogger);
    let receipt: CreatorRunReceipt | undefined;

    for await (const event of adapter.run(
      RunAgentInputSchema.parse({
        threadId: "creator-thread",
        runId: "creator-run",
        messages: [
          {
            id: "request",
            role: "user",
            content: "给我增加历史会话管理。",
          },
        ],
        tools: [],
        context: [],
        state: {},
      }),
    )) {
      if (event.type === "RUN_FINISHED") {
        receipt = (event.result as { receipt: CreatorRunReceipt }).receipt;
      }
    }

    expect(receipt?.diagnosticLog).toMatchObject({
      format: "jsonl",
      path: expect.stringMatching(
        /^\.agentuicreator\/logs\/.*_creator-run\.jsonl$/u,
      ),
      schemaVersion: 1,
    });
    const relativeLogPath = receipt?.diagnosticLog?.path;
    expect(relativeLogPath).toBeDefined();
    const source = await readFile(
      path.join(projectRoot, ...(relativeLogPath ?? "").split("/")),
      "utf8",
    );
    const entries = source
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            type: string;
            data: Record<string, unknown>;
          },
      );
    const eventTypes = entries.map((entry) => entry.type);

    expect(eventTypes[0]).toBe("run_started");
    expect(eventTypes.filter((type) => type === "model_response")).toHaveLength(
      3,
    );
    expect(eventTypes).toContain("tool_call_started");
    expect(eventTypes).toContain("tool_call_finished");
    expect(eventTypes.at(-1)).toBe("run_finished");
    expect(entries[0]?.data).toMatchObject({
      runtime: "typescript",
      agentMode: "legacy",
    });
    expect(entries.at(-1)?.data).toMatchObject({
      runtime: "typescript",
      agentMode: "legacy",
    });
    expect(source).toContain("edit_file");
    expect(source).toContain("history-main");
    expect(source).toContain("历史会话入口已更新");
    await expect(
      readFile(path.join(projectRoot, ".agentuicreator", ".gitignore"), "utf8"),
    ).resolves.toBe("*\n");
  });

  it("redacts common credentials before writing diagnostic data", async () => {
    const projectRoot = await createTemporaryProject();
    const runLogger = new CreatorRunLogger({ projectRoot });

    await runLogger.begin({
      source: "session",
      runId: "secret-run",
      messages: [],
    });
    await runLogger.record("fixture", {
      MODEL_API_KEY: "top-secret-value",
      output:
        "MODEL_API_KEY=top-secret-value Authorization: Bearer bearer-secret-value",
    });
    await runLogger.finish("success", {});

    const reference = runLogger.reference();
    const source = await readFile(
      path.join(projectRoot, ...(reference?.path ?? "").split("/")),
      "utf8",
    );
    expect(source).not.toContain("top-secret-value");
    expect(source).not.toContain("bearer-secret-value");
    expect(source).toContain("[REDACTED]");
  });

  it("keeps completion-gate feedback when a run exhausts its repair attempts", async () => {
    const projectRoot = await createTemporaryProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const runLogger = new CreatorRunLogger({ projectRoot });
    const model = fakeModel()
      .respond(new AIMessage("已经完成。"))
      .respond(new AIMessage("已经完成。"))
      .respond(new AIMessage("已经完成。"))
      .respond(new AIMessage("已经完成。"));
    const agent = createCreatorAgent({
      model,
      projectRoot,
      activity,
      runLogger,
    });
    const adapter = new CreatorAgUiAdapter(agent, activity, runLogger);

    for await (const _event of adapter.run(
      RunAgentInputSchema.parse({
        threadId: "creator-thread",
        runId: "failed-run",
        messages: [
          {
            id: "request",
            role: "user",
            content: "给我增加历史会话管理。",
          },
        ],
        tools: [],
        context: [],
        state: {},
      }),
    )) {
      // Drain the complete AG-UI run.
    }

    const reference = runLogger.reference();
    const source = await readFile(
      path.join(projectRoot, ...(reference?.path ?? "").split("/")),
      "utf8",
    );
    expect(source).toContain("creator_completion_review");
    expect(source).toContain("found no net project file changes");
    expect(source).toContain("无法确认本次修改已经完成");
  });
});
