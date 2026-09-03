import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import {
  CREATOR_COMPLETION_REVIEW_TOOL,
  CreatorActivityRecorder,
  createCreatorAgent,
  finalCreatorMessage,
} from "../src/index.js";

const temporaryProjects: string[] = [];

async function createTemporaryProject(): Promise<string> {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "agent-ui-completion-gate-"),
  );
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await mkdir(path.join(projectRoot, "plugins"));
  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    JSON.stringify(
      {
        version: "2",
        root: {
          type: "panel",
          id: "right-panel",
          width: "320px",
          child: {
            type: "slot",
            id: "right-slot-node",
            slotId: "right",
          },
        },
        slots: {
          right: {
            id: "right",
            kind: "single",
            scope: "root",
            description: "Right fixture",
            owner: { type: "layout", nodeId: "right-slot-node" },
            occupants: [],
          },
        },
        pluginInstances: {},
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({
      scripts: {
        typecheck: "node -e \"console.log('types ok')\"",
        "verify:ui": "node -e \"console.log('ui composition ok')\"",
      },
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

describe("CreatorCompletionGate", () => {
  it("rejects a false no-change completion and accepts the repaired revision", async () => {
    const projectRoot = await createTemporaryProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const model = fakeModel()
      .respond(new AIMessage("已经添加历史会话面板。"))
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
            old_string: '"320px"',
            new_string: '"360px"',
            replace_all: false,
          },
        },
      ])
      .respond(new AIMessage("当前文件已经修改并验证。"))
      .respond(
        new AIMessage(
          "[creator-verification:revision=1]\n历史会话区域已经添加并完成验证。",
        ),
      )
      .respond(
        new AIMessage(
          "[creator-verification:revision=1]\n历史会话区域已经添加并完成验证。",
        ),
      );
    const agent = createCreatorAgent({ model, projectRoot, activity });

    activity.begin();
    const result = await agent.invoke({
      messages: [{ role: "user", content: "给我添加一个历史会话面板。" }],
    });
    const receipt = await activity.finish();

    expect(finalCreatorMessage(result)).toBe(
      "历史会话区域已经添加并完成验证。",
    );
    expect(receipt.verification).toMatchObject({
      status: "changed-and-verified",
      projectRevision: 1,
      auditAttempts: 2,
    });
    expect(receipt.validations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: "pnpm verify:ui",
          status: "passed",
          revision: 1,
        }),
        expect.objectContaining({
          command: "pnpm typecheck",
          status: "passed",
          revision: 1,
        }),
      ]),
    );
    const reviews = result.messages.filter(
      (message: unknown) =>
        ToolMessage.isInstance(message) &&
        message.name === CREATOR_COMPLETION_REVIEW_TOOL,
    ) as ToolMessage[];
    expect(reviews).toHaveLength(2);
    expect(reviews[0]?.text).toContain("no net project file changes");
    expect(reviews[1]?.text).toContain("needs a completion audit");
    await expect(
      readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    ).resolves.toContain("360px");
  });

  it("revalidates after a write makes an earlier typecheck stale", async () => {
    const projectRoot = await createTemporaryProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const model = fakeModel()
      .respondWithTools([
        { name: "execute", args: { command: "pnpm typecheck" } },
      ])
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
            old_string: '"320px"',
            new_string: '"360px"',
            replace_all: false,
          },
        },
      ])
      .respond(new AIMessage("宽度已经更新。"))
      .respond(
        new AIMessage(
          "[creator-verification:revision=1]\n宽度已经更新并重新验证。",
        ),
      )
      .respond(
        new AIMessage(
          "[creator-verification:revision=1]\n宽度已经更新并重新验证。",
        ),
      );
    const agent = createCreatorAgent({ model, projectRoot, activity });

    activity.begin();
    await agent.invoke({
      messages: [{ role: "user", content: "把右侧区域改成 360px。" }],
    });
    const receipt = await activity.finish();
    const typechecks = receipt.validations.filter(
      (validation) => validation.command === "pnpm typecheck",
    );

    expect(typechecks.map((validation) => validation.revision)).toEqual([0, 1]);
    expect(receipt.verification?.status).toBe("changed-and-verified");
  });

  it("accepts an explicitly audited read-only response without project changes", async () => {
    const projectRoot = await createTemporaryProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const model = fakeModel()
      .respond(new AIMessage("AppUIModel 使用 Layout Tree。"))
      .respond(
        new AIMessage(
          "[creator-verification:read-only]\nAppUIModel 使用 Layout Tree 描述布局。",
        ),
      );
    const agent = createCreatorAgent({ model, projectRoot, activity });

    activity.begin();
    const result = await agent.invoke({
      messages: [{ role: "user", content: "AppUIModel 如何描述布局？" }],
    });
    const receipt = await activity.finish();

    expect(finalCreatorMessage(result)).toBe(
      "AppUIModel 使用 Layout Tree 描述布局。",
    );
    expect(receipt.verification?.status).toBe("no-project-change");
    expect(receipt.files).toEqual([]);
  });

  it("replaces repeated unverifiable success claims with a truthful failure", async () => {
    const projectRoot = await createTemporaryProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const model = fakeModel()
      .respond(new AIMessage("已经完成。"))
      .respond(new AIMessage("已经完成。"))
      .respond(new AIMessage("已经完成。"))
      .respond(new AIMessage("已经完成。"));
    const agent = createCreatorAgent({ model, projectRoot, activity });

    activity.begin();
    const result = await agent.invoke({
      messages: [{ role: "user", content: "添加一个历史会话面板。" }],
    });
    const receipt = await activity.finish();

    expect(finalCreatorMessage(result)).toContain("无法确认本次修改已经完成");
    expect(receipt.verification?.status).toBe("failed");
    expect(receipt.files).toEqual([]);
  });
});
