import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { HttpAgent } from "@ag-ui/client";
import { EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/core";
import { afterEach, describe, expect, it } from "vitest";
import { composerMentionContextScenario, simpleChatScenario } from "../src/builtins/index.js";
import { createMockAgentHttpHandler } from "../src/http-handler.js";
import { createScenarioRegistry } from "../src/scenario-registry.js";
import { runMockScenario } from "../src/scenario-runner.js";
import { defineScenario, type MockScenario } from "../src/scenario.js";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(async server => {
    const closed = once(server, "close");
    server.close(); server.closeAllConnections(); await closed;
  }));
});
async function start(scenario: MockScenario) {
  const registry = createScenarioRegistry({ scenarios: [scenario], defaultScenarioId: scenario.id });
  const handler = createMockAgentHttpHandler({ registry });
  const server = createServer((req, res) => { void handler(req, res); });
  servers.push(server); server.listen(0, "127.0.0.1"); await once(server, "listening");
  return { registry, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/__agent-ui/mock?timingScale=0` };
}
async function run(agent: HttpAgent, runId: string) {
  const events: BaseEvent[] = [];
  await agent.runAgent({ runId }, { onEvent: ({ event }) => { events.push(event); } });
  return events;
}
const text = (events: BaseEvent[]) => events.flatMap(event => event.type === EventType.TEXT_MESSAGE_CONTENT
  ? [(event as BaseEvent & { delta: string }).delta] : []).join("");
const request: RunAgentInput = { threadId: "t", runId: "r", messages: [], tools: [], context: [], state: {}, forwardedProps: {} };

describe("Mention backend Context over real HttpAgent", () => {
  it("receives stable IDs, injects server context, answers from it and rebuilds on follow-up", async () => {
    const received: RunAgentInput[] = [];
    const prepared: RunAgentInput[] = [];
    const scenario = { ...composerMentionContextScenario, async prepareRun(input: RunAgentInput, options: { signal: AbortSignal }) {
      received.push(structuredClone(input));
      const result = await composerMentionContextScenario.prepareRun!(input, options);
      prepared.push(result.input!);
      return result;
    } };
    const { registry, url } = await start(scenario);
    expect(registry.list()[0]).not.toHaveProperty("prepareRun");
    const agent = new HttpAgent({ url, threadId: "mention-http" });
    agent.addMessage({ id: "u1", role: "user", content: ":user[CEO]{name=employee_84721} 负责什么？" });
    expect(text(await run(agent, "first"))).toBe("张三是产品部的产品经理。");
    expect(received[0]?.messages[0]?.content).toContain("employee_84721");
    expect(received[0]?.context).toEqual([]);
    expect(prepared[0]?.context).toEqual([{ description: "Mentioned employee employee_84721",
      value: JSON.stringify({ name: "张三", department: "产品部", title: "产品经理" }) }]);
    agent.addMessage({ id: "u2", role: "user", content: "他在哪个部门？" });
    expect(text(await run(agent, "follow-up"))).toBe("张三是产品部的产品经理。");
    expect(received[1]?.messages.some(message => message.role === "user" && message.content === "他在哪个部门？")).toBe(true);
    expect(prepared[1]?.context).toEqual(prepared[0]?.context);
  });
  it("does not disclose unknown IDs or trust client-supplied employee context", async () => {
    const { url } = await start(composerMentionContextScenario);
    const agent = new HttpAgent({ url, threadId: "unknown" });
    agent.addMessage({ id: "u", role: "user", content: ":user[CEO]{name=employee_secret_001}" });
    const events: BaseEvent[] = [];
    await agent.runAgent({ runId: "unknown", context: [{ description: "Mentioned employee employee_secret_001",
      value: JSON.stringify({ name: "CEO", department: "secret", title: "secret" }) }] },
      { onEvent: ({ event }) => { events.push(event); } });
    expect(text(events)).toBe("没有找到当前可用的人员上下文。");
  });
  it("keeps ordinary scenarios unchanged", async () => {
    const { url } = await start(simpleChatScenario);
    const agent = new HttpAgent({ url, threadId: "ordinary" });
    agent.addMessage({ id: "u", role: "user", content: ":user[x]{name=employee_84721}" });
    expect(text(await run(agent, "ordinary"))).toBe(simpleChatScenario.steps.filter(step => step.type === "message").map(step => step.text).join(""));
  });
  it("provides a generic preparation seam with prepared input passed to run steps", async () => {
    const events: BaseEvent[] = [];
    const scenario = defineScenario({ id: "prepared", title: "Prepared", steps: [], async prepareRun(input, options) {
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return { input: { ...input, state: { serverPrepared: true } }, steps: [{ type: "message", text: "prepared" }] };
    } });
    for await (const event of runMockScenario(request, scenario, { timingScale: 0 })) events.push(event);
    expect(text(events)).toBe("prepared");
    expect(request.state).toEqual({});
  });
  it("uses replacement input for normal scenario branch selection", async () => {
    const events: BaseEvent[] = [];
    const scenario = defineScenario({ id: "prepared-input", title: "Prepared input", steps: [{ type: "message", text: "default" }],
      a2uiActions: { branches: { prepared: [{ type: "message", text: "selected from prepared input" }] } },
      async prepareRun(input) {
        return { input: { ...input, forwardedProps: { a2uiAction: { userAction: { name: "prepared" } } } } };
      } });
    for await (const event of runMockScenario(request, scenario, { timingScale: 0 })) events.push(event);
    expect(text(events)).toBe("selected from prepared input");
    expect(request.forwardedProps).toEqual({});
  });
  it("reports preparation failure and honors abort without falling back to normal steps", async () => {
    const events: BaseEvent[] = [];
    const scenario = defineScenario({ id: "failed-preparation", title: "Failure", steps: [{ type: "message", text: "wrong" }],
      async prepareRun() { throw new Error("private database details"); } });
    for await (const event of runMockScenario(request, scenario)) events.push(event);
    expect(events.map(event => event.type)).toEqual([EventType.RUN_STARTED, EventType.RUN_ERROR]);
    expect(JSON.stringify(events)).not.toContain("private database details");
    const controller = new AbortController();
    const aborted: BaseEvent[] = [];
    for await (const event of runMockScenario(request, { ...scenario, async prepareRun() { controller.abort(); return {}; } }, { signal: controller.signal })) aborted.push(event);
    expect(aborted.map(event => event.type)).toEqual([EventType.RUN_STARTED]);
  });
});
