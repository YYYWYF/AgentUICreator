import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { CreatorAgentRuntime } from "../src/agent/runner.js";
import { RunActivity } from "../src/agent/activity.js";

const model = vi.hoisted(() => ({ invoke: vi.fn<(messages: BaseMessage[], options: unknown) => Promise<AIMessage>>() }));
vi.mock("../src/agent/config.js", () => ({
  hostEnvironment: () => ({ CREATOR_AGENT_MODE: "domain-write", CREATOR_MODEL_MAX_RETRIES: "0" }),
  createModel: () => model,
}));

interface PermissionClassifier {
  classify(messages: { role: "user"; content: string }[], threadId: string, signal: AbortSignal,
    log: (event: string, data: object) => Promise<unknown>): Promise<{ readOnly: boolean }>;
}

const roots: string[] = [];
afterEach(async () => {
  model.invoke.mockReset();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function classifier() {
  const root = await mkdtemp(path.join(tmpdir(), "creator route 中文 "));
  roots.push(root);
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), path.join(root, "contracts"));
  const activity = new RunActivity(root, "rename-route", new AbortController().signal);
  const classify = (request: string) => (runtime as unknown as PermissionClassifier).classify(
    [{ role: "user", content: request }], "rename-route", activity.signal, (event, data) => activity.log(event, data));
  return { root, activity, classify };
}

it.each([
  { request: "将助理的名字改为「小招」。", permission: "domain_write", readOnly: false },
  { request: "现在的助理名称是什么？", permission: "inspect_read_only", readOnly: true },
])("accepts $permission with valid JSON examples in the classification prompt", async ({ request, permission, readOnly }) => {
  model.invoke.mockResolvedValue(new AIMessage(JSON.stringify({ permission })));
  const { classify } = await classifier();
  expect(await classify(request)).toEqual({ readOnly });
  const messages = model.invoke.mock.calls[0]?.[0];
  const prompt = messages?.[0]?.content;
  if (typeof prompt !== "string") throw new Error("Missing classification prompt");
  const examples = [...prompt.matchAll(/return (\{"permission":[^}]+\})/gu)].map(match => JSON.parse(match[1]!) as unknown);
  expect(examples).toEqual([{ permission: "inspect_read_only" }, { permission: "domain_write" }]);
  expect(prompt).not.toContain('"inspect_read_only"|"domain_write"');
});

it.each([
  { rawContent: "允许修改。\r\n{\"permission\":\"domain_write\"}", stage: "json" },
  { rawContent: '{"permission":"inspect_read_only"|"domain_write"}', stage: "json" },
  { rawContent: '{"permission":"domain_write","approve":true}', stage: "envelope" },
  { rawContent: [{ type: "text" as const, text: "无法分类\r\n请重试。" }], stage: "json" },
])("persists the original model content on $stage failure without granting writes", async ({ rawContent, stage }) => {
  model.invoke.mockResolvedValue(new AIMessage({ content: rawContent, response_metadata: { finish_reason: "stop" } }));
  const { root, activity, classify } = await classifier();
  await expect(classify("将助理的名字改为「小招」。")).rejects.toThrow("CREATOR_REQUEST_ROUTE_INVALID");
  expect(model.invoke).toHaveBeenCalledTimes(1);
  const lines = (await readFile(path.join(root, activity.logPath), "utf8")).trim().split("\n");
  expect(lines).toHaveLength(1);
  const entry: unknown = JSON.parse(lines[0]!);
  expect(entry).toMatchObject({ event: "request_route_invalid", stage, rawContent, finishReason: "stop" });
});
