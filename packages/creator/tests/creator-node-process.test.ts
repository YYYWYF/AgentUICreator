import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CreatorProcessManager } from "../src/CreatorProcessManager.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function manager() {
  const root = await mkdtemp(path.join(os.tmpdir(), "creator-node-process-")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "assistant", sourceRoot: "src" }));
  return new CreatorProcessManager({ projectRoot: root, environment: { ...process.env, CREATOR_AGENT_MODE: "echo", CREATOR_HOT_RELOAD: "false" } });
}

it("keeps a disconnected model task alive, stops it explicitly, and accepts the next task", async () => {
  let entered!: () => void;
  const modelEntered = new Promise<void>(resolve => { entered = resolve; });
  let calls = 0;
  const model = createServer(async (request, response) => {
    for await (const _ of request) { /* consume the OpenAI-compatible request */ }
    calls++;
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (delta: object, finish_reason: string | null) => response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: "assistant", content: calls === 1 ? "检查中" : "检查完成" }, null);
    if (calls === 1) entered();
    else { chunk({}, "stop"); response.end("data: [DONE]\n\n"); }
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  const process = await manager();
  // Reuse the fixture root, with a real Node worker and real HTTP model transport.
  await process.dispose();
  const runtime = new CreatorProcessManager({ projectRoot: roots.at(-1)!, environment: { ...globalThis.process.env,
    CREATOR_AGENT_MODE: "domain-read", CREATOR_HOT_RELOAD: "false", CREATOR_MODEL_API_KEY: "fixture",
    CREATOR_MODEL_BASE_URL: `http://127.0.0.1:${(model.address() as { port: number }).port}/v1`, CREATOR_MODEL_NAME: "fixture" } });
  try {
    const endpoint = await runtime.ensureStarted();
    const base = `http://127.0.0.1:${endpoint.port}`;
    const headers = { Authorization: `Bearer ${endpoint.authToken}`, "Content-Type": "application/json" };
    const input = { threadId: "thread", runId: "detached", messages: [{ role: "user", id: "u", content: "只读检查" }], state: {}, tools: [], context: [], forwardedProps: {} };
    const response = await fetch(`${base}/creator`, { method: "POST", headers, body: JSON.stringify(input) });
    const reader = response.body!.getReader(); await reader.read(); await reader.cancel();
    await modelEntered;
    expect(await runtime.isBusy()).toBe(true);
    const reconnected = await fetch(`${base}/creator?threadId=thread&runId=detached`, { headers });
    const stopped = await fetch(`${base}/creator-control`, { method: "POST", headers, body: JSON.stringify({ action: "stop", threadId: "thread", runId: "detached" }) });
    expect(stopped.status).toBe(202);
    expect(await reconnected.text()).toContain('"code":"CREATOR_RUN_STOPPED"');
    expect(await runtime.isBusy()).toBe(false);
    const next = await fetch(`${base}/creator`, { method: "POST", headers, body: JSON.stringify({ ...input, runId: "next" }) });
    expect(await next.text()).toContain('"completion":"success"');
    expect(calls).toBe(2);
  } finally {
    await runtime.dispose();
    model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve()));
  }
}, 15000);
it("starts and closes the actual Node runtime through its authenticated handshake", async () => {
  const process = await manager();
  try {
    const endpoint = await process.ensureStarted();
    const health = await (await fetch(`http://127.0.0.1:${endpoint.port}/health`, { headers: { Authorization: `Bearer ${endpoint.authToken}` } })).json();
    expect(health).toMatchObject({ runtime: "typescript", agentMode: "echo" });
    const contract = JSON.parse(await readFile(new URL("../contracts/creator/creator-transport.schema.json", import.meta.url), "utf8"));
    const ajv = new Ajv2020({ strict: false });
    ajv.addSchema(contract);
    const validateHealth = ajv.compile({ $ref: `${contract.$id}#/$defs/health` });
    expect(validateHealth(health), JSON.stringify(validateHealth.errors)).toBe(true);
  } finally { await process.dispose(); }
  expect(process.processId).toBeUndefined();
}, 10000);
it("can dispose during startup without leaving a child or rejecting shutdown", async () => {
  const process = await manager();
  const startup = process.ensureStarted().then(() => undefined, error => error);
  await expect(process.dispose()).resolves.toBeUndefined();
  expect(await startup).toBeInstanceOf(Error); expect(process.processId).toBeUndefined();
  await expect(process.ensureStarted()).rejects.toThrow("disposed");
}, 10000);

it("replays a completed run and rejects reusing its ID for different work", async () => {
  const process = await manager();
  try {
    const endpoint = await process.ensureStarted();
    const url = `http://127.0.0.1:${endpoint.port}/creator`;
    const headers = { Authorization: `Bearer ${endpoint.authToken}`, "Content-Type": "application/json" };
    const input = { threadId: "thread-1", runId: "once", messages: [{ id: "user-1", role: "user", content: "你好" }], state: {}, tools: [], context: [], forwardedProps: {} };
    const send = (body: unknown) => fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const original = await (await send(input)).text();
    expect(original).toContain("RUN_FINISHED");
    expect(await (await fetch(`${url}?threadId=thread-1&runId=once`, { headers })).text()).toBe(original);
    expect(await (await send(input)).text()).toBe(original);
    expect((await send({ ...input, messages: [] })).status).toBe(409);
    expect((await fetch(`${url}?threadId=other&runId=once`, { headers })).status).toBe(404);
    expect(await process.isBusy()).toBe(false);
    expect(await (await send({ ...input, runId: "next" })).text()).toContain("RUN_FINISHED");
  } finally { await process.dispose(); }
}, 10000);
