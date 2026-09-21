import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { HttpAgent, type RunAgentParameters } from "@ag-ui/client";
import { EventType, type BaseEvent, type ResumeEntry } from "@ag-ui/core";
import { afterEach, describe, expect, it } from "vitest";

import { showcaseMockScenarios } from "../src/builtins/index.js";
import { createMockAgentHttpHandler } from "../src/http-handler.js";
import { createScenarioRegistry } from "../src/scenario-registry.js";
import { defineScenario, type MockScenario } from "../src/scenario.js";

const openServers: Server[] = [];

async function startMockServer(
  scenarios: MockScenario[],
  defaultScenarioId = scenarios[0]?.id ?? "missing",
): Promise<string> {
  const registry = createScenarioRegistry({ scenarios, defaultScenarioId });
  const handler = createMockAgentHttpHandler({ registry });
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  openServers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/__agent-ui/mock`;
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(async (server) => {
    server.close();
    await once(server, "close");
  }));
});

function integrationScenario(): MockScenario {
  return defineScenario({
    id: "http-integration",
    title: "HTTP Integration",
    initialState: { mock: true },
    steps: [
      { type: "reasoning", text: "分析", durationMs: 4 },
      {
        type: "tool",
        name: "search_files",
        args: { keyword: "AG-UI" },
        result: { files: ["ConversationRuntimeProvider.tsx"] },
        prepareDurationMs: 4,
        durationMs: 8,
      },
      { type: "message", text: "完成", intervalMs: 2 },
    ],
  });
}

describe("Mock Agent HTTP endpoint", () => {
  it("streams standard SSE events through the real HttpAgent", async () => {
    const endpoint = await startMockServer([integrationScenario()]);
    const agent = new HttpAgent({ url: endpoint, threadId: "thread-http" });
    const events: BaseEvent[] = [];
    agent.addMessage({ id: "user-1", role: "user", content: "检查项目" });

    await agent.runAgent({ runId: "run-http" }, {
      onEvent: ({ event }) => {
        events.push(event);
      },
    });

    expect(events.map(({ type }) => type)).toEqual([
      EventType.RUN_STARTED,
      EventType.STATE_SNAPSHOT,
      EventType.REASONING_START,
      EventType.REASONING_MESSAGE_START,
      EventType.REASONING_MESSAGE_CONTENT,
      EventType.REASONING_MESSAGE_CONTENT,
      EventType.REASONING_MESSAGE_END,
      EventType.REASONING_END,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.TOOL_CALL_RESULT,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
  });

  it("uses the default scenario when the query parameter is absent", async () => {
    const endpoint = await startMockServer(
      selectionScenarios(),
      "reasoning-tool-success",
    );
    const events = await runHttpAgent(endpoint);

    expect(events.some(({ type }) => type === EventType.REASONING_START)).toBe(
      true,
    );
    expect(events.filter(({ type }) => type === EventType.TOOL_CALL_START))
      .toHaveLength(1);
  });

  it("selects the simple-chat scenario through the query parameter", async () => {
    const endpoint = await startMockServer(
      selectionScenarios(),
      "reasoning-tool-success",
    );
    const events = await runHttpAgent(`${endpoint}?scenario=simple-chat`);

    expect(events.map(({ type }) => type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
  });

  it("runs sequential tools with distinct ids in the multi-tool scenario", async () => {
    const endpoint = await startMockServer(
      selectionScenarios(),
      "reasoning-tool-success",
    );
    const events = await runHttpAgent(`${endpoint}?scenario=multi-tool`);
    const toolCallIds = events
      .filter(({ type }) => type === EventType.TOOL_CALL_START)
      .map((event) => "toolCallId" in event ? event.toolCallId : undefined);

    expect(toolCallIds).toHaveLength(2);
    expect(new Set(toolCallIds).size).toBe(2);
  });

  it("runs parallel-tools through the real HttpAgent", async () => {
    const endpoint = await startMockServer(showcaseMockScenarios);
    const agent = new HttpAgent({
      url: `${endpoint}?scenario=parallel-tools&speed=0`,
      threadId: "thread-parallel-tools",
    });
    agent.addMessage({
      id: "user-parallel-tools",
      role: "user",
      content: "并行检查",
    });

    const events = await collectAgentRun(agent, { runId: "run-parallel-tools" });
    const toolStarts = events
      .filter((event) => event.type === EventType.TOOL_CALL_START)
      .map((event) => event.toolCallId);

    expect(toolStarts).toEqual([
      "parallel-search-files",
      "parallel-inspect-component",
      "parallel-read-config",
    ]);
    const firstResultIndex = events.findIndex((event) =>
      event.type === EventType.TOOL_CALL_RESULT,
    );
    expect(firstResultIndex).toBeGreaterThan(-1);
    expect(events.slice(0, firstResultIndex).filter((event) =>
      event.type === EventType.TOOL_CALL_START,
    )).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: { type: "success" },
    });
  });

  it("runs the nested subagent conversation through the real HttpAgent", async () => {
    const endpoint = await startMockServer(showcaseMockScenarios);
    const agent = new HttpAgent({
      url: `${endpoint}?scenario=nested-subagent-conversation&speed=0`,
      threadId: "thread-nested-subagent",
    });
    agent.addMessage({
      id: "user-nested-subagent",
      role: "user",
      content: "检查 Agent UI 架构",
    });

    const events = await collectAgentRun(agent, {
      runId: "run-nested-subagent",
    });
    const started = events.findIndex((event) =>
      event.type === EventType.SUBAGENT_STARTED,
    );
    const finished = events.findIndex((event, index) =>
      index > started && event.type === EventType.SUBAGENT_FINISHED,
    );
    const parentStart = events.findIndex((event) =>
      event.type === EventType.TOOL_CALL_START &&
      event.toolCallName === "delegate_specialist",
    );
    const parentEnd = events.findIndex((event) =>
      event.type === EventType.TOOL_CALL_END &&
      event.toolCallId === "invoke-researcher-1",
    );
    const parentResult = events.findIndex((event) =>
      event.type === EventType.TOOL_CALL_RESULT &&
      event.toolCallId === "invoke-researcher-1",
    );

    expect(events[parentStart]).toMatchObject({
      toolCallId: "invoke-researcher-1",
      toolCallName: "delegate_specialist",
    });
    expect(events[started]).toMatchObject({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: "researcher-1",
      parentToolCallId: "invoke-researcher-1",
    });
    expect(parentEnd).toBeGreaterThan(parentStart);
    expect(parentEnd).toBeLessThan(started);
    expect(finished).toBeGreaterThan(started);
    expect(parentResult).toBeGreaterThan(finished);
    expect(events.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: { type: "success" },
    });
  });

  it("runs approval-resume through HTTP and resumes the same interrupted tool", async () => {
    const endpoint = await startMockServer(showcaseMockScenarios);
    const agent = new HttpAgent({
      url: `${endpoint}?scenario=approval-resume&speed=0`,
      threadId: "thread-approval-allow",
    });
    agent.addMessage({
      id: "user-approval-allow",
      role: "user",
      content: "允许清理",
    });

    const firstRun = await collectAgentRun(agent, { runId: "run-approval-1" });
    expect(firstRun).toContainEqual(expect.objectContaining({
      type: EventType.TOOL_CALL_START,
      toolCallId: "approval-dangerous-tool",
    }));
    expect(firstRun).toContainEqual(expect.objectContaining({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "approval-dangerous-tool",
    }));
    expect(firstRun).toContainEqual(expect.objectContaining({
      type: EventType.RUN_FINISHED,
      outcome: {
        type: "interrupt",
        interrupts: [expect.objectContaining({
          id: "approval-resume-1",
          toolCallId: "approval-dangerous-tool",
        })],
      },
    }));
    expect(firstRun.some((event) =>
      event.type === EventType.TOOL_CALL_RESULT &&
      event.toolCallId === "approval-dangerous-tool",
    )).toBe(false);

    const resume: ResumeEntry = {
      interruptId: "approval-resume-1",
      status: "resolved",
      payload: { approved: true },
    };
    const secondRun = await collectAgentRun(agent, {
      runId: "run-approval-2",
      resume: [resume],
    });
    const toolEndIndex = secondRun.findIndex((event) =>
      event.type === EventType.TOOL_CALL_END &&
      event.toolCallId === "approval-dangerous-tool",
    );
    const toolResultIndex = secondRun.findIndex((event) =>
      event.type === EventType.TOOL_CALL_RESULT &&
      event.toolCallId === "approval-dangerous-tool",
    );

    expect(toolEndIndex).toBeGreaterThan(-1);
    expect(toolResultIndex).toBeGreaterThan(toolEndIndex);
    expect(secondRun.some(({ type }) => type === EventType.TEXT_MESSAGE_START)).toBe(true);
    expect(secondRun.some(({ type }) => type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true);
    expect(secondRun.some(({ type }) => type === EventType.TEXT_MESSAGE_END)).toBe(true);
    expect(secondRun.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: { type: "success" },
    });
  });

  it("runs approval-resume through HTTP and keeps the denied tool without a result", async () => {
    const endpoint = await startMockServer(showcaseMockScenarios);
    const agent = new HttpAgent({
      url: `${endpoint}?scenario=approval-resume&speed=0`,
      threadId: "thread-approval-deny",
    });
    agent.addMessage({
      id: "user-approval-deny",
      role: "user",
      content: "拒绝清理",
    });

    await collectAgentRun(agent, { runId: "run-approval-deny-1" });
    const secondRun = await collectAgentRun(agent, {
      runId: "run-approval-deny-2",
      resume: [{
        interruptId: "approval-resume-1",
        status: "cancelled",
      }],
    });

    expect(secondRun.some((event) =>
      event.type === EventType.TOOL_CALL_RESULT &&
      event.toolCallId === "approval-dangerous-tool",
    )).toBe(false);
    expect(textFromEvents(secondRun)).toContain(
      "你拒绝了这次操作，我保留了工作区文件。",
    );
    expect(secondRun.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: { type: "success" },
    });
  });

  it("returns a 404 JSON error for an unknown scenario", async () => {
    const endpoint = await startMockServer(
      selectionScenarios(),
      "reasoning-tool-success",
    );
    const response = await fetch(`${endpoint}?scenario=missing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      error: "Unknown mock scenario: missing",
    });
  });

  it("lists scenario metadata without fixture implementation details", async () => {
    const endpoint = await startMockServer(
      showcaseMockScenarios,
      "reasoning-tool-success",
    );
    const response = await fetch(`${endpoint}/scenarios`);
    const body = await response.json() as {
      defaultScenarioId: string;
      scenarios: Record<string, unknown>[];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.defaultScenarioId).toBe("reasoning-tool-success");
    expect(body.scenarios).toHaveLength(showcaseMockScenarios.length);
    expect(body.scenarios.map(({ id }) => id)).toEqual([
      "simple-chat",
      "reasoning-chat",
      "reasoning-tool-success",
      "parallel-tools",
      "tool-error",
      "approval-resume",
      "agent-state-sync",
      "nested-subagent-conversation",
      "nested-subagent-task-group",
      "agent-plan",
      "agent-status",
      "nested-subagent-recursive",
      "nested-subagent-error",
    ]);
    expect(body.scenarios[0]).not.toHaveProperty("steps");
    expect(body.scenarios[0]).not.toHaveProperty("initialState");
    expect(body.scenarios.find(({ id }) => id === "tool-error"))
      .toMatchObject({
        title: "Run Error During Tool",
        category: "tools",
        capabilities: ["tool", "run-error"],
      });
    expect(body.scenarios.find(({ id }) => id === "agent-plan"))
      .toMatchObject({
        title: "Custom Tool → AgentPlan",
        reference: {
          protocol: "AG-UI Tool Call",
          pattern: "Application-defined Tool Result → Agent Element",
          presentation: "assistant-ui AgentPlan",
        },
      });
  });
});

function selectionScenarios(): MockScenario[] {
  return [
    defineScenario({
      id: "simple-chat",
      title: "Simple Chat",
      steps: [{ type: "message", text: "好", intervalMs: 0 }],
    }),
    defineScenario({
      id: "reasoning-tool-success",
      title: "Reasoning + Tool",
      steps: [
        { type: "reasoning", text: "想", durationMs: 0 },
        {
          type: "tool",
          name: "default_tool",
          args: {},
          result: {},
          prepareDurationMs: 0,
          durationMs: 0,
        },
      ],
    }),
    defineScenario({
      id: "multi-tool",
      title: "Multiple Tools",
      steps: [
        {
          type: "tool",
          name: "first_tool",
          args: {},
          result: {},
          prepareDurationMs: 0,
          durationMs: 0,
        },
        {
          type: "tool",
          name: "second_tool",
          args: {},
          result: {},
          prepareDurationMs: 0,
          durationMs: 0,
        },
      ],
    }),
  ];
}

async function runHttpAgent(endpoint: string): Promise<BaseEvent[]> {
  const agent = new HttpAgent({ url: endpoint, threadId: "thread-selection" });
  agent.addMessage({ id: "user-selection", role: "user", content: "运行" });
  return collectAgentRun(agent, { runId: "run-selection" });
}

async function collectAgentRun(
  agent: HttpAgent,
  parameters: RunAgentParameters,
): Promise<BaseEvent[]> {
  const events: BaseEvent[] = [];
  await agent.runAgent(parameters, {
    onEvent: ({ event }) => {
      events.push(event);
    },
  });
  return events;
}

function textFromEvents(events: readonly BaseEvent[]): string {
  return events
    .filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
    .map((event) => event.delta)
    .join("");
}
