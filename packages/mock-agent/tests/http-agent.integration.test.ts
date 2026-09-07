import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { HttpAgent } from "@ag-ui/client";
import { EventType, type BaseEvent } from "@ag-ui/core";
import { createAgUiTransport } from "@agent-ui/runtime-agui";
import { createAgentRuntime, type AgentRuntimeSnapshot } from "@agent-ui/runtime-core";
import { afterEach, describe, expect, it } from "vitest";

import { createMockAgentHttpHandler } from "../src/http-handler.js";
import { defineScenario, type MockScenario } from "../src/scenario.js";

const openServers: Server[] = [];

async function startMockServer(scenario: MockScenario): Promise<string> {
  const handler = createMockAgentHttpHandler({ scenario });
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
    const endpoint = await startMockServer(integrationScenario());
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
    const endpoint = await startMockServer(integrationScenario());
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
});
