import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { EventType, RunAgentInputSchema } from "@ag-ui/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  CreatorActivityRecorder,
  CreatorAgUiAdapter,
  createCreatorAgent,
  creatorLangChainMessages,
} from "../src/index.js";

const temporaryProjects: string[] = [];

async function createTemporaryProject(): Promise<string> {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "agent-ui-creator-adapter-"),
  );
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    JSON.stringify(
      {
        version: "1",
        root: {
          type: "panel",
          id: "main-panel",
          width: "320px",
          child: {
            type: "slot",
            id: "chat-slot",
            slotId: "chat",
            pluginInstanceIds: [],
          },
        },
        pluginInstances: {},
      },
      null,
      2,
    ),
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

describe("creatorLangChainMessages", () => {
  it("preserves assistant tool calls and tool results from AG-UI history", () => {
    const messages = creatorLangChainMessages([
      {
        id: "assistant-tool-message",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tool-call-1",
            type: "function",
            function: {
              name: "read_file",
              arguments: '{"file_path":"/project/app-ui/app-ui.json"}',
            },
          },
        ],
      },
      {
        id: "tool-result-1",
        role: "tool",
        toolCallId: "tool-call-1",
        content: '{"version":"1"}',
      },
    ]);

    expect(messages[0]).toBeInstanceOf(AIMessage);
    expect((messages[0] as AIMessage).tool_calls).toEqual([
      {
        type: "tool_call",
        id: "tool-call-1",
        name: "read_file",
        args: { file_path: "/project/app-ui/app-ui.json" },
      },
    ]);
    expect(messages[1]).toBeInstanceOf(ToolMessage);
    expect((messages[1] as ToolMessage).tool_call_id).toBe("tool-call-1");
  });

  it("repairs a blank tool call id consistently across restored history", () => {
    const messages = creatorLangChainMessages([
      {
        id: "assistant-tool-message",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "",
            type: "function",
            function: {
              name: "read_file",
              arguments: '{"file_path":"/project/app-ui/app-ui.json"}',
            },
          },
        ],
      },
      {
        id: "tool-result-1",
        role: "tool",
        toolCallId: "",
        content: '{"version":"1"}',
      },
    ]);
    const toolCallId = (messages[0] as AIMessage).tool_calls?.[0]?.id;

    expect(toolCallId).toBeTruthy();
    expect((messages[1] as ToolMessage).tool_call_id).toBe(toolCallId);
  });

  it("drops an incomplete restored tool turn before the next user message", () => {
    const messages = creatorLangChainMessages([
      {
        id: "assistant-tool-message",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "",
            type: "function",
            function: {
              name: "read_file",
              arguments: '{"file_path":"/project/app-ui/app-ui.json"}',
            },
          },
        ],
      },
      {
        id: "next-user-message",
        role: "user",
        content: "Continue with the current project state.",
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("Continue with the current project state.");
  });
});

describe("CreatorAgUiAdapter", () => {
  it("projects DeepAgents v3 text, tools, and the real modification receipt", async () => {
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
            replace_all: false,
          },
        },
      ])
      .respond(new AIMessage("# 宽度已更新\n\n- 右侧区域现在是 `360px`。"));
    const agent = createCreatorAgent({ model, projectRoot, activity });
    const adapter = new CreatorAgUiAdapter(agent, activity);
    const input = RunAgentInputSchema.parse({
      threadId: "creator-thread",
      runId: "creator-run",
      messages: [
        {
          id: "prior-user",
          role: "user",
          content: "右侧区域目前是 320px。",
        },
        {
          id: "prior-assistant",
          role: "assistant",
          content: "我会保留这个上下文。",
        },
        {
          id: "current-user",
          role: "user",
          content: "把它改成 360px。",
        },
      ],
      tools: [],
      context: [],
      state: {},
    });
    const events = [];

    for await (const event of adapter.run(input)) {
      events.push(event);
    }

    const eventTypes = events.map((event) => event.type);
    expect(eventTypes[0]).toBe(EventType.RUN_STARTED);
    expect(eventTypes.at(-1)).toBe(EventType.RUN_FINISHED);
    expect(eventTypes.filter((type) => type === EventType.TOOL_CALL_START)).toHaveLength(2);
    expect(eventTypes.filter((type) => type === EventType.TOOL_CALL_ARGS)).toHaveLength(2);
    expect(eventTypes.filter((type) => type === EventType.TOOL_CALL_END)).toHaveLength(2);
    expect(eventTypes.filter((type) => type === EventType.TOOL_CALL_RESULT)).toHaveLength(2);

    for (const startIndex of eventTypes
      .map((type, index) => (type === EventType.TOOL_CALL_START ? index : -1))
      .filter((index) => index >= 0)) {
      const argsIndex = eventTypes.indexOf(EventType.TOOL_CALL_ARGS, startIndex);
      const endIndex = eventTypes.indexOf(EventType.TOOL_CALL_END, argsIndex);
      const resultIndex = eventTypes.indexOf(EventType.TOOL_CALL_RESULT, endIndex);
      expect(startIndex).toBeLessThan(argsIndex);
      expect(argsIndex).toBeLessThan(endIndex);
      expect(endIndex).toBeLessThan(resultIndex);
    }

    const finalTextStart = eventTypes.lastIndexOf(EventType.TEXT_MESSAGE_START);
    const finalTextEnd = eventTypes.indexOf(
      EventType.TEXT_MESSAGE_END,
      finalTextStart,
    );
    const finalText = events
      .slice(finalTextStart, finalTextEnd)
      .filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((event) => event.delta)
      .join("");
    expect(finalText).toBe("# 宽度已更新\n\n- 右侧区域现在是 `360px`。");

    const finished = events.find(
      (event) => event.type === EventType.RUN_FINISHED,
    );
    expect(finished).toMatchObject({
      threadId: "creator-thread",
      runId: "creator-run",
      result: {
        receipt: {
          files: [
            expect.objectContaining({
              path: "app-ui/app-ui.json",
              status: "modified",
              diff: expect.stringContaining("360px"),
            }),
          ],
          validations: [],
        },
      },
    });
    await expect(
      readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    ).resolves.toContain("360px");

    const firstModelCall = model.calls.at(0)?.messages ?? [];
    expect(firstModelCall.find((message) => message.id === "prior-user")?.text).toBe(
      "右侧区域目前是 320px。",
    );
    expect(
      firstModelCall.find((message) => message.id === "prior-assistant"),
    ).toBeInstanceOf(AIMessage);
    expect(
      firstModelCall.find((message) => message.id === "current-user")?.text,
    ).toBe("把它改成 360px。");
  });
});
