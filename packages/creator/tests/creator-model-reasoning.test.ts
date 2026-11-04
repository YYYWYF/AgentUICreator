import { expect, it, vi } from "vitest";
import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { tool } from "@langchain/core/tools";
import { Command, MemorySaver, interrupt } from "@langchain/langgraph";
import { createAgent } from "langchain";
import { z } from "zod";
import { createModel } from "../src/agent/config.js";
import { CreatorChatCompletions } from "../src/agent/chat-completions.js";
import { reasoningContent } from "../src/agent/reasoning-content.js";

const reasoning = "synthetic-continuation";
type Checkpoint = { tasks: { interrupts?: unknown[] }[]; values: { messages: BaseMessage[] } };
const tools = [{ type: "function" as const, function: { name: "probe", description: "Local test", parameters: { type: "object", properties: {} } } }];
function answer(response: ServerResponse, body: any) {
  const continuation = body.messages.some((message: any) => message.role === "tool");
  const id = continuation ? "fixture-final" : "fixture-first";
  const toolCall = { id: "probe-call", type: "function", function: { name: "probe", arguments: "{}" } };
  const message = { role: "assistant", content: continuation ? "14" : null, reasoning_content: reasoning, ...(!continuation ? { tool_calls: [toolCall] } : {}) };
  const usage = { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18, completion_tokens_details: { reasoning_tokens: 5 } };
  if (!body.stream) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id, object: "chat.completion", created: 1, model: body.model, choices: [{ index: 0, message, finish_reason: continuation ? "stop" : "tool_calls" }], usage }));
    return;
  }
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const send = (delta: object, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
  send({ role: "assistant", reasoning_content: "synthetic-" });
  send({ reasoning_content: "continuation" });
  send(continuation ? { content: "14" } : { tool_calls: [{ index: 0, ...toolCall }] });
  send({}, continuation ? "stop" : "tool_calls");
  response.end(`data: ${JSON.stringify({ id, choices: [], usage })}\n\ndata: [DONE]\n\n`);
}
async function fixture(run: (model: ReturnType<typeof createModel>, requests: any[], baseURL: string) => Promise<void>, modelName = "deepseek-v4.1-flash") {
  const requests: any[] = [];
  const server = createServer(async (request, response) => {
    let input = ""; for await (const chunk of request) input += chunk;
    const body = JSON.parse(input); requests.push(body);
    // A strict provider would reject the old outbound conversion here.
    if (/deepseek/iu.test(body.model) && body.tools?.length && body.messages.some((message: any) => message.role === "assistant" && typeof message.reasoning_content !== "string")) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "Missing reasoning_content" } }));
    } else answer(response, body);
  });
  const tokens = vi.spyOn(BaseChatModel.prototype, "getNumTokens").mockResolvedValue(1);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as import("node:net").AddressInfo).port;
  const baseURL = `http://127.0.0.1:${port}/v1`;
  try {
    await run(createModel({ CREATOR_MODEL_BASE_URL: baseURL, CREATOR_MODEL_API_KEY: "local-fixture", CREATOR_MODEL_NAME: modelName }, "reasoning-test"), requests, baseURL);
  } finally { tokens.mockRestore(); server.closeAllConnections(); server.close(); }
}
const continued = (message: BaseMessage) => [new HumanMessage("Use probe"), message, new ToolMessage({ content: "7", tool_call_id: "probe-call" })];

it.each(["invoke", "stream", "native events", "non-streaming"])("round-trips fragmented reasoning through %s without changing tools, usage or input messages", async mode => {
  await fixture(async (configured, requests, baseURL) => {
    const model = mode === "non-streaming" ? new CreatorChatCompletions({ model: "deepseek-v4.1-flash", apiKey: "fixture", configuration: { baseURL }, maxRetries: 0 }) : configured;
    let first: AIMessage;
    if (mode === "native events") {
      const stream = await configured.streamEvents([new HumanMessage("Use probe")], { tools });
      first = await stream;
      expect(first.response_metadata.output_version).toBe("v1");
      expect(Array.isArray(first.content)).toBe(true);
    } else if (mode === "stream") {
      let combined: any;
      for await (const chunk of await model.stream("Use probe", { tools })) combined = combined ? combined.concat(chunk) : chunk;
      first = combined;
    } else first = await model.invoke("Use probe", { tools });
    expect(reasoningContent(first)).toBe(reasoning);
    expect(first.tool_calls).toEqual([{ name: "probe", args: {}, id: "probe-call", type: "tool_call" }]);
    expect(first.usage_metadata).toMatchObject({ input_tokens: 10, output_tokens: 8, total_tokens: 18 });
    const messages = continued(first), before = JSON.stringify(messages);
    const final = await model.invoke(messages, { tools });
    expect(final.content).toBe("14");
    expect(requests).toHaveLength(2);
    expect(requests[1].messages[1]).toMatchObject({ role: "assistant", reasoning_content: reasoning, tool_calls: [{ id: "probe-call", function: { name: "probe", arguments: "{}" } }] });
    expect(requests[1].messages[2]).toEqual({ role: "tool", content: "7", tool_call_id: "probe-call" });
    expect(JSON.stringify(messages)).toBe(before);
  });
});

it("preserves assistant continuation with no tool call and fills DeepSeek's missing historical field", async () => {
  await fixture(async (model, requests) => {
    const messages = [new HumanMessage({ content: "Next", additional_kwargs: { reasoning_content: "not assistant state" } }),
      new AIMessage({ content: "Earlier answer", additional_kwargs: { reasoning_content: "earlier-synthetic", unrelated: "do not forward" } }), new AIMessage("Old transcript")];
    await model.invoke(messages, { tools });
    expect(requests[0].messages).toEqual([{ role: "user", content: "Next" }, { role: "assistant", content: "Earlier answer", reasoning_content: "earlier-synthetic" }, { role: "assistant", content: "Old transcript", reasoning_content: "" }]);
  });
});

it("keeps normal models unchanged and isolates simultaneous invocation histories", async () => {
  await fixture(async (model, requests) => {
    await model.invoke([new HumanMessage("Plain"), new AIMessage("Earlier")], { tools });
    expect(requests[0].messages[1]).toEqual({ role: "assistant", content: "Earlier" });
    await Promise.all(["first", "second"].map(value => model.withConfig({ tags: [value] }).invoke([
      new HumanMessage(value), new AIMessage({ content: value, additional_kwargs: { reasoning_content: `synthetic-${value}` } }),
    ], { tools })));
    for (const request of requests.slice(1)) expect(request.messages[1].reasoning_content).toBe(`synthetic-${request.messages[0].content}`);
  }, "ordinary-model");
});

it("retains native reasoning in a real graph checkpoint across tool interruption and resume", async () => {
  await fixture(async (model, requests) => {
    const probe = tool(() => { interrupt({ question: "Continue local test?" }); return "7"; }, { name: "probe", description: "Local interrupt test", schema: z.object({}) });
    const graph = createAgent({ model, tools: [probe], checkpointer: new MemorySaver() });
    const config = { version: "v3" as const, recursionLimit: Infinity, configurable: { thread_id: "reasoning-interrupt" } };
    const first = await graph.streamEvents({ messages: [new HumanMessage("Use probe")] }, config);
    await first.output;
    expect(requests).toHaveLength(1);
    const snapshot: Checkpoint = await graph.getState(config);
    expect(snapshot.tasks.some(task => task.interrupts?.length)).toBe(true);
    const original = snapshot.values.messages.find((message: BaseMessage) => AIMessage.isInstance(message));
    if (!original) throw new Error("Missing checkpoint assistant message");
    expect(reasoningContent(original)).toBe(reasoning);
    expect(original.response_metadata.output_version).toBe("v1");
    const resumed = await graph.streamEvents(new Command({ resume: "yes" }), config);
    await resumed.output;
    expect(requests).toHaveLength(2);
    expect(requests[1].messages.find((message: any) => message.role === "assistant").reasoning_content).toBe(reasoning);
    const final: Checkpoint = await graph.getState(config);
    expect(final.values.messages.at(-1)?.text).toBe("14");
    expect(reasoningContent(final.values.messages.at(-1)!)).toBe(reasoning);
  });
});
