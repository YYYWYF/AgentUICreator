import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AIMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import {
  CREATOR_FILESYSTEM_PERMISSIONS,
  CREATOR_SKILLS_SOURCE,
  CREATOR_SUMMARIZATION_TRIGGER_MESSAGES,
  CreatorActivityRecorder,
  CreatorSkillsBackend,
  ProjectCommandBackend,
  ProjectCreatorBackend,
  createCreatorAgent,
  finalCreatorMessage,
} from "../src/index.js";

const temporaryProjects: string[] = [];

async function createTemporaryProject(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "agent-ui-creator-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await mkdir(path.join(projectRoot, "plugins", "chat"), { recursive: true });
  await mkdir(path.join(projectRoot, "runtime"));
  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    JSON.stringify(
      {
        version: "2",
        root: {
          type: "row",
          id: "main-layout",
          sizes: ["1fr", "320px"],
          children: [
            { type: "slot", id: "left", slotId: "chat" },
            {
              type: "panel",
              id: "right",
              width: "320px",
              child: {
                type: "slot",
                id: "right-slot",
                slotId: "preview",
              },
            },
          ],
        },
        pluginInstances: {},
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(projectRoot, "plugins", "chat", "index.tsx"),
    "export function ChatPlugin() { return null; }\n",
  );
  await writeFile(
    path.join(projectRoot, "runtime", "AgentRuntime.ts"),
    "export const runtimeVersion = 1;\n",
  );

  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { force: true, recursive: true }),
    ),
  );
});

describe("ProjectCreatorBackend", () => {
  it("contains filesystem access and rejects arbitrary commands", async () => {
    const projectRoot = await createTemporaryProject();
    const backend = new ProjectCreatorBackend({ projectRoot });
    const commandBackend = new ProjectCommandBackend({ projectRoot });

    const escapedRead = await backend.read("/../etc/passwd");
    const command = await commandBackend.execute("rm -rf app-ui");
    const deletion = await backend.delete("/app-ui/app-ui.json");

    expect(escapedRead.error).toContain("Path traversal not allowed");
    expect(command.exitCode).toBe(126);
    expect(command.output).toContain("Command is not allowed");
    expect(deletion.error).toContain("Deletion is disabled");
  });

  it("serves Creator skills through an explicitly read-only backend", async () => {
    const skillsRoot = await mkdtemp(
      path.join(tmpdir(), "agent-ui-creator-skills-"),
    );
    temporaryProjects.push(skillsRoot);
    await mkdir(path.join(skillsRoot, "example"));
    const skillPath = path.join(skillsRoot, "example", "SKILL.md");
    const originalSkill = "---\nname: example\ndescription: Example skill.\n---\n";
    await writeFile(skillPath, originalSkill);
    const backend = new CreatorSkillsBackend({ skillsRoot });

    await expect(backend.read("/example/SKILL.md")).resolves.toMatchObject({
      content: expect.stringContaining("name: example"),
    });
    await expect(
      backend.write("/example/SKILL.md", "replacement"),
    ).resolves.toMatchObject({ error: expect.stringContaining("read-only") });
    await expect(
      backend.edit("/example/SKILL.md", "Example", "Changed"),
    ).resolves.toMatchObject({ error: expect.stringContaining("read-only") });
    await expect(backend.delete("/example/SKILL.md")).resolves.toMatchObject({
      error: expect.stringContaining("read-only"),
    });
    await expect(readFile(skillPath, "utf8")).resolves.toBe(originalSkill);
  });

  it("records the real exit code and output of validation commands", async () => {
    const projectRoot = await createTemporaryProject();
    await writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({
        scripts: {
          typecheck: "node -e \"console.log('types ok')\"",
        },
      }),
    );
    const activity = new CreatorActivityRecorder(projectRoot);
    const backend = new ProjectCommandBackend({ projectRoot, activity });

    activity.begin();
    const result = await backend.execute("pnpm typecheck");
    const receipt = await activity.finish();

    expect(result.exitCode).toBe(0);
    expect(receipt.validations).toEqual([
      expect.objectContaining({
        command: "pnpm typecheck",
        status: "passed",
        exitCode: 0,
        output: expect.stringContaining("types ok"),
      }),
    ]);
  });

  it("normalizes safe validation command variants without opening the shell", async () => {
    const projectRoot = await createTemporaryProject();
    await writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({
        scripts: {
          typecheck: "node -e \"console.log('types ok')\"",
        },
      }),
    );
    const activity = new CreatorActivityRecorder(projectRoot);
    const backend = new ProjectCommandBackend({ projectRoot, activity });

    activity.begin();
    const unicodeWhitespaceResult = await backend.execute(
      "pnpm\u00a0typecheck\u200b",
    );
    const runAliasResult = await backend.execute("pnpm run typecheck");
    const chainedCommandResult = await backend.execute(
      "pnpm typecheck && echo unsafe",
    );
    const receipt = await activity.finish();

    expect(unicodeWhitespaceResult.exitCode).toBe(0);
    expect(runAliasResult.exitCode).toBe(0);
    expect(chainedCommandResult.exitCode).toBe(126);
    expect(receipt.validations.map((validation) => validation.command)).toEqual([
      "pnpm typecheck",
      "pnpm typecheck",
    ]);
  });

  it("records target-owned Registry generation as a mutation only when bytes change", async () => {
    const projectRoot = await createTemporaryProject();
    await writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({
        scripts: {
          "generate:registry":
            "node -e \"require('node:fs').writeFileSync('plugins/registry.generated.ts', 'generated\\n')\"",
        },
      }),
    );
    const activity = new CreatorActivityRecorder(projectRoot);
    const backend = new ProjectCommandBackend({ projectRoot, activity });

    activity.begin();
    const first = await backend.execute("pnpm generate:registry");
    const revisionAfterFirst = activity.revision;
    const second = await backend.execute("pnpm run generate:registry");
    const receipt = await activity.finish();

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(revisionAfterFirst).toBe(1);
    expect(activity.revision).toBe(1);
    expect(receipt.validations).toEqual([]);
    expect(receipt.files).toEqual([
      expect.objectContaining({
        path: "plugins/registry.generated.ts",
        status: "created",
      }),
    ]);
  });
});

describe("createCreatorAgent", () => {
  it("uses the DeepAgents summarization middleware before long history reaches the model", async () => {
    const projectRoot = await createTemporaryProject();
    const model = fakeModel()
      .respond(new AIMessage("Earlier Creator decisions summarized."))
      .respond(new AIMessage("Continued from the compacted context."));
    const agent = createCreatorAgent({ model, projectRoot });
    const messages = Array.from(
      { length: CREATOR_SUMMARIZATION_TRIGGER_MESSAGES },
      (_, index) =>
        index % 2 === 0
          ? ({ role: "user" as const, content: `Request ${index}` })
          : ({ role: "assistant" as const, content: `Response ${index}` }),
    );

    const result = await agent.invoke({ messages });

    expect(model.callCount).toBe(2);
    expect(finalCreatorMessage(result)).toBe(
      "Continued from the compacted context.",
    );
    expect(
      model.calls.at(-1)?.messages.some((message) =>
        message.text.includes("Earlier Creator decisions summarized."),
      ),
    ).toBe(true);
  });

  it("exposes model text through the DeepAgents v3 message stream", async () => {
    const projectRoot = await createTemporaryProject();
    const model = fakeModel().respond(
      new AIMessage("**The Creator response is streaming.**"),
    );
    const agent = createCreatorAgent({ model, projectRoot });
    const run = await agent.streamEvents(
      {
        messages: [{ role: "user", content: "Stream a Markdown response." }],
      },
      { version: "v3" },
    );
    const deltas: string[] = [];

    for await (const message of run.messages) {
      for await (const delta of message.text) {
        deltas.push(delta);
      }
    }
    const output = await run.output;

    expect(deltas.join("")).toBe("**The Creator response is streaming.**");
    expect(finalCreatorMessage(output)).toBe(
      "**The Creator response is streaming.**",
    );
  });

  it("repairs an empty provider tool call id before returning the tool result", async () => {
    const projectRoot = await createTemporaryProject();
    const model = fakeModel()
      .respondWithTools([
        {
          id: "",
          name: "read_file",
          args: { file_path: "/project/app-ui/app-ui.json" },
        },
      ])
      .respond(new AIMessage("Tool result accepted."));
    const agent = createCreatorAgent({ model, projectRoot });

    await agent.invoke({
      messages: [{ role: "user", content: "Read the AppUIModel." }],
    });

    const secondModelCall = model.calls[1]?.messages ?? [];
    const assistantToolCall = secondModelCall.find(
      (message) =>
        AIMessage.isInstance(message) && (message.tool_calls?.length ?? 0) > 0,
    ) as AIMessage | undefined;
    const toolResult = secondModelCall.find((message) =>
      ToolMessage.isInstance(message),
    ) as ToolMessage | undefined;
    const toolCallId = assistantToolCall?.tool_calls?.[0]?.id;

    expect(toolCallId).toBeTruthy();
    expect(toolResult?.tool_call_id).toBe(toolCallId);
  });

  it("executes an allowlisted validation command through the full Agent tool path", async () => {
    const projectRoot = await createTemporaryProject();
    await writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({
        scripts: {
          typecheck: "node -e \"console.log('types ok')\"",
        },
      }),
    );
    const activity = new CreatorActivityRecorder(projectRoot);
    const model = fakeModel()
      .respondWithTools([
        {
          name: "execute",
          args: { command: "pnpm\u00a0typecheck\u200b" },
        },
      ])
      .respond(new AIMessage("Validation passed."));
    const agent = createCreatorAgent({
      model,
      projectRoot,
      activity,
      completionGate: false,
    });

    activity.begin();
    const result = await agent.invoke({
      messages: [{ role: "user", content: "Run the project typecheck." }],
    });
    const receipt = await activity.finish();
    const validationResult = result.messages.find(
      (message: unknown) =>
        ToolMessage.isInstance(message) && message.name === "execute",
    ) as ToolMessage | undefined;

    expect(validationResult?.status).toBe("success");
    expect(validationResult?.text).toContain("types ok");
    expect(validationResult?.text).toContain(
      "[Command succeeded with exit code 0]",
    );
    expect(receipt.validations).toEqual([
      expect.objectContaining({
        command: "pnpm typecheck",
        status: "passed",
        exitCode: 0,
      }),
    ]);
  });

  it("uses DeepAgents tools to apply a natural-language layout change", async () => {
    const projectRoot = await createTemporaryProject();
    const activity = new CreatorActivityRecorder(projectRoot);
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
            old_string: '"320px"',
            new_string: '"360px"',
            replace_all: true,
          },
        },
      ])
      .respond(new AIMessage("Updated the right region to 360px."));
    const agent = createCreatorAgent({
      model,
      projectRoot,
      activity,
      completionGate: false,
    });

    activity.begin();
    await agent.invoke({
      messages: [
        {
          role: "user",
          content: "把右边区域改成 360px。",
        },
      ],
    });
    const receipt = await activity.finish();

    const modelJson = await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    );

    expect(modelJson.match(/360px/g)).toHaveLength(2);
    expect(model.callCount).toBe(3);
    expect(receipt.files).toHaveLength(1);
    expect(receipt.files[0]).toMatchObject({
      path: "app-ui/app-ui.json",
      status: "modified",
      truncated: false,
    });
    expect(receipt.files[0]?.diff).toMatch(/-.*320px/u);
    expect(receipt.files[0]?.diff).toMatch(/\+.*360px/u);
    expect(receipt.files[0]?.diff.match(/^@@/gmu)).toHaveLength(2);
  });

  it("allows Phase 8 Creator to create UI Plugin source", async () => {
    const projectRoot = await createTemporaryProject();
    const pluginSource = `import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function ToolCallDetailsPlugin({ context }: UIPluginComponentProps) {
  return <div>{context.messages.length}</div>;
}
`;
    const model = fakeModel()
      .respondWithTools([
        {
          name: "write_file",
          args: {
            file_path: "/project/plugins/tool-call-details/index.tsx",
            content: pluginSource,
          },
        },
      ])
      .respond(new AIMessage("Created the tool-call details UI Plugin."));
    const agent = createCreatorAgent({ model, projectRoot });

    await agent.invoke({
      messages: [{ role: "user", content: "Create a tool-call details Plugin." }],
    });

    await expect(
      readFile(
        path.join(projectRoot, "plugins", "tool-call-details", "index.tsx"),
        "utf8",
      ),
    ).resolves.toBe(pluginSource);
  });

  it("keeps Runtime source outside the Phase 8 write boundary", async () => {
    const projectRoot = await createTemporaryProject();
    const runtimePath = path.join(projectRoot, "runtime", "AgentRuntime.ts");
    const originalRuntime = await readFile(runtimePath, "utf8");
    const model = fakeModel()
      .respondWithTools([
        {
          name: "edit_file",
          args: {
            file_path: "/project/runtime/AgentRuntime.ts",
            old_string: "runtimeVersion = 1",
            new_string: "runtimeVersion = 2",
            replace_all: false,
          },
        },
      ])
      .respond(new AIMessage("Runtime writes remain outside this phase."));
    const agent = createCreatorAgent({ model, projectRoot });

    await agent.invoke({
      messages: [{ role: "user", content: "Modify the Agent Runtime." }],
    });

    await expect(readFile(runtimePath, "utf8")).resolves.toBe(originalRuntime);
  });

  it("rejects direct edits to the generated production Registry", async () => {
    const projectRoot = await createTemporaryProject();
    const registryPath = path.join(
      projectRoot,
      "plugins",
      "registry.generated.ts",
    );
    await writeFile(registryPath, "export const pluginDefinitions = [];\n");
    const model = fakeModel()
      .respondWithTools([
        {
          name: "write_file",
          args: {
            file_path: "/project/plugins/registry.generated.ts",
            content: "export const pluginDefinitions = ['manual'];\n",
          },
        },
      ])
      .respond(new AIMessage("Generated files remain script-owned."));
    const agent = createCreatorAgent({ model, projectRoot });

    await agent.invoke({
      messages: [{ role: "user", content: "直接修改生成 Registry。" }],
    });

    await expect(readFile(registryPath, "utf8")).resolves.toBe(
      "export const pluginDefinitions = [];\n",
    );
  });

  it("advertises all Creator skills and loads full instructions on demand", async () => {
    const projectRoot = await createTemporaryProject();
    const model = fakeModel()
      .respondWithTools([
        {
          name: "read_file",
          args: {
            file_path: "/skills/ui-layout/SKILL.md",
            limit: 500,
          },
        },
      ])
      .respond(new AIMessage("Applied the UI layout guidance."));
    const agent = createCreatorAgent({ model, projectRoot });

    const result = await agent.invoke({
      messages: [{ role: "user", content: "Add a right-side region." }],
    });

    const firstCallText = model.calls
      .at(0)
      ?.messages.map((message) => message.text)
      .join("\n");
    expect(firstCallText).toContain("Available Skills");
    expect(firstCallText).toContain("app-ui-model");
    expect(firstCallText).toContain("ui-layout");
    expect(firstCallText).toContain("ui-plugin-development");
    expect(firstCallText).toContain("ag-ui-frontend");
    expect(firstCallText).toContain("ui-debugging");
    expect(firstCallText).toContain("inspect_ui_project");
    expect(firstCallText).toContain("<ui-project-navigation-snapshot>");
    expect(firstCallText).toContain("<creator-current-state>");
    expect(firstCallText).toContain("CONTROL_ENTRY_MISSING");
    expect(firstCallText).toContain("stream-friendly Markdown");
    expect(firstCallText).toContain("names only commands actually run");
    expect(firstCallText).toContain("observed results");
    expect(firstCallText).toContain("never force a CSS example");

    const secondCallText = model.calls
      .at(1)
      ?.messages.map((message) => message.text)
      .join("\n");
    expect(secondCallText).toContain(
      "Express composition through the AppUIModel Layout Tree",
    );
    const skillsMetadata = (
      result as unknown as { skillsMetadata?: Array<{ name: string }> }
    ).skillsMetadata;
    expect(skillsMetadata?.map((skill) => skill.name).sort()).toEqual([
      "ag-ui-frontend",
      "app-ui-model",
      "ui-debugging",
      "ui-layout",
      "ui-plugin-development",
    ]);
  });

  it("declares AppUIModel and UI Plugin write targets", () => {
    expect(CREATOR_FILESYSTEM_PERMISSIONS).toEqual([
      { operations: ["read"], paths: ["/skills/**"] },
      {
        operations: ["write"],
        paths: ["/skills/**"],
        mode: "deny",
      },
      { operations: ["read"], paths: ["/project/**"] },
      {
        operations: ["write"],
        paths: ["/project/app-ui/app-ui.json"],
      },
      {
        operations: ["write"],
        paths: [
          "/project/plugins/index.ts",
          "/project/plugins/registry.generated.ts",
        ],
        mode: "deny",
      },
      {
        operations: ["write"],
        paths: ["/project/plugins/**"],
      },
      {
        operations: ["write"],
        paths: ["/project/**"],
        mode: "deny",
      },
    ]);
    expect(CREATOR_SKILLS_SOURCE).toBe("/skills/");
  });
});
