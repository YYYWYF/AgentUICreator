import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { HttpAgent } from "@ag-ui/client";
import { EventType, type BaseEvent } from "@ag-ui/core";
import { createAgUiTransport } from "@agent-ui/runtime-agui";
import { createAgentRuntime, type AgentRuntimeSnapshot } from "@agent-ui/runtime-core";
import { afterEach, describe, expect, it } from "vitest";

import { builtinMockScenarios } from "../src/builtins/index.js";
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
        result: { files: ["AgUiTransport.ts"] },
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

  it("drives AgUiTransport and LifecycleProjector state transitions", async () => {
    const endpoint = await startMockServer([integrationScenario()]);
    const runtime = createAgentRuntime<{ mock?: boolean }>({
      transport: createAgUiTransport<{ mock?: boolean }>({ endpoint }),
    });
    const snapshots: AgentRuntimeSnapshot<{ mock?: boolean }>[] = [
      runtime.getSnapshot(),
    ];
    const unsubscribe = runtime.subscribe(() => {
      snapshots.push(runtime.getSnapshot());
    });

    await runtime.sendMessage("检查项目");
    unsubscribe();

    const statusesFor = (type: "reasoning" | "tool") => snapshots.flatMap(
      ({ executions }) => executions
        .filter((execution) => execution.type === type)
        .map(({ status }) => status),
    );
    expect(snapshots.some(({ run }) => run.status === "running")).toBe(true);
    expect(runtime.getSnapshot().run.status).toBe("idle");
    expect(statusesFor("reasoning")).toContain("running");
    expect(statusesFor("reasoning")).toContain("completed");
    const toolStatuses = statusesFor("tool");
    expect(toolStatuses).toContain("preparing");
    expect(toolStatuses).toContain("awaiting-result");
    expect(toolStatuses).toContain("completed");
    expect(toolStatuses.indexOf("preparing")).toBeLessThan(
      toolStatuses.indexOf("awaiting-result"),
    );
    expect(snapshots.some(({ messages }) => messages.some((message) =>
      message.role === "assistant" && message.streamStatus === "streaming"
    ))).toBe(true);
    expect(runtime.getSnapshot().messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "assistant",
        content: "完成",
        streamStatus: "completed",
      }),
    ]));
    expect(runtime.getSnapshot().state).toEqual({ mock: true });
    runtime.dispose();
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
      builtinMockScenarios,
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
    expect(body.scenarios).toHaveLength(4);
    expect(body.scenarios[0]).not.toHaveProperty("steps");
    expect(body.scenarios[0]).not.toHaveProperty("initialState");
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
  const events: BaseEvent[] = [];
  agent.addMessage({ id: "user-selection", role: "user", content: "运行" });

  await agent.runAgent({ runId: "run-selection" }, {
    onEvent: ({ event }) => events.push(event),
  });
  return events;
}
