import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ConversationContextStore } from "../src/agent/conversation-context.js";
import { CreatorContextArtifacts } from "../src/agent/context-artifacts.js";
import { estimateMessageTokens, type ContextWindowOptions } from "../src/agent/context-window.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function project() { const root = await mkdtemp(path.join(tmpdir(), "creator conversation 中文 ")); roots.push(root); return root; }
class SummaryModel extends BaseChatModel {
  constructor() { super({}); }
  prompts: BaseMessage[][] = [];
  fail = false;
  _llmType() { return "conversation-summary-test"; }
  async _generate(messages: BaseMessage[]) {
    this.prompts.push(messages);
    if (this.fail) throw new Error("summary unavailable");
    const text = "Historical task A: card color #6842ae; width 420. User said preserve vendor. Assistant reported implementation; browser remains unverified. Earlier task constraints do not define the current goal.";
    return { generations: [{ text, message: new AIMessage(text) }] };
  }
}
function history() {
  return Array.from({ length: 18 }, (_, index) => [
    new HumanMessage(`Task A turn ${index}: card color #6842ae, width 420. Preserve vendor. ${"discussion ".repeat(340)}`),
    new AIMessage(`Task A result ${index}: reported changes, browser unverified. ${"investigation ".repeat(280)}`),
  ]).flat();
}
function setup(model = new SummaryModel(), signal = new AbortController().signal) {
  const logs: any[] = [], artifacts = new CreatorContextArtifacts();
  const window: ContextWindowOptions = { environment: { CREATOR_MODEL_MAX_TOKENS: "2048" }, request: "Task B", signal: () => signal,
    model: () => model, log: async (event, data) => { logs.push({ event, ...data }); } };
  return { window, artifacts, logs, model };
}
function reference(messages: BaseMessage[]) {
  const note = messages.find(message => String(message.content).startsWith("Historical conversation reference"))!;
  return JSON.parse(String(note.content).split("\n").slice(1).join(""));
}

it.each(["Task B: inspect the toolbar only. Do not edit files.", "Continue task A: inspect the card using its original color. Do not edit files."])("bounds old dialogue while preserving continuation or switching: %s", async currentRequest => {
  const root = await project(), store = new ConversationContextStore(), fixture = setup();
  const prior = history(), request = new HumanMessage(currentRequest), messages = [...prior, request];
  const before = JSON.stringify(messages);
  const projectInput = await store.prepare({ root, threadId: "one", messages, ...fixture });
  const result = projectInput(messages);
  expect(fixture.model.prompts).toHaveLength(1);
  expect(estimateMessageTokens(result.slice(0, -1))).toBeLessThanOrEqual(8000);
  expect(result.at(-1)).toBe(request);
  expect(result).toContain(prior.at(-2)); expect(result).toContain(prior.at(-1));
  expect(fixture.model.prompts[0]!.map(message => message.content).join(" ")).toContain("Do not promote an earlier task");
  expect(fixture.model.prompts[0]!.map(message => message.content).join(" ")).not.toContain(request.content);
  expect(JSON.stringify(messages)).toBe(before);
  const nav = reference(result);
  expect(fixture.artifacts.read(nav.artifactId, ["result", "messages", 0, "content"], 0, 8000).content).toBe(prior[0]!.content);
  expect(fixture.artifacts.read(nav.artifactId)).toMatchObject({ historical: true, grantsFreshness: false, originalTool: "conversation-history" });
  // A changed checkpoint prefix is never replaced by a projection of different history.
  const changed = [new HumanMessage("concurrently changed"), ...messages.slice(1)];
  expect(projectInput(changed)).toBe(changed);
});

it("reuses dialogue across new requests, continues the original task and revisits it after another task", async () => {
  const root = await project(), store = new ConversationContextStore(), model = new SummaryModel();
  const prior = history(), first = setup(model), switchRequest = new HumanMessage("Task B: toolbar height 40.");
  await store.prepare({ root, threadId: "one", messages: [...prior, switchRequest], ...first });
  const calls = model.prompts.length;
  let messages: BaseMessage[] = [...prior, switchRequest, new AIMessage("Toolbar inspected: height 40."), new HumanMessage("Continue task B; preserve that height.")];
  const second = setup(model), projectSecond = await store.prepare({ root, threadId: "one", messages, ...second });
  expect(model.prompts).toHaveLength(calls);
  expect(projectSecond(messages)).toContain(messages.at(-2)); expect(projectSecond(messages).at(-1)).toBe(messages.at(-1));
  messages = [...messages, new AIMessage("Task B complete."), new HumanMessage("Return to task A; use its original color and width.")];
  const third = setup(model), projectThird = await store.prepare({ root, threadId: "one", messages, ...third });
  expect(model.prompts).toHaveLength(calls);
  const nav = reference(projectThird(messages));
  expect(third.artifacts.read(nav.artifactId, ["result", "messages", 0, "content"]).content).toContain("#6842ae, width 420");
  expect(nav.artifactId).not.toBe(reference(projectSecond([...messages.slice(0, -2)])).artifactId);
  expect(() => third.artifacts.read(reference(projectSecond(messages)).artifactId)).toThrow("CREATOR_CONTEXT_ARTIFACT_NOT_FOUND");
  expect(third.logs.find(row => row.event === "conversation_projection")).toMatchObject({ summaryModelCalls: 0, cachedPrefixMessages: expect.any(Number) });
});

it("invalidates edited prefixes, separates projects and threads, expires and evicts bounded entries", async () => {
  const root = await project(), other = await project(), model = new SummaryModel();
  let now = 0;
  const store = new ConversationContextStore(() => now, 1000, 2), messages = [...history(), new HumanMessage("Task B")];
  const prepare = (projectRoot: string, threadId: string, input = messages) => store.prepare({ root: projectRoot, threadId, messages: input, ...setup(model) });
  await prepare(root, "one"); const initial = model.prompts.length;
  await prepare(root, "one"); expect(model.prompts).toHaveLength(initial);
  await prepare(root, "one", [new HumanMessage("Corrected: color red"), ...messages.slice(1)]);
  expect(model.prompts).toHaveLength(initial + 1);
  await prepare(other, "one"); await prepare(root, "two");
  const evicted = model.prompts.length; await prepare(root, "one"); expect(model.prompts).toHaveLength(evicted + 1);
  now = 1001; const expired = model.prompts.length; await prepare(root, "one"); expect(model.prompts).toHaveLength(expired + 1);
  await store.forget(root, "one"); const forgotten = model.prompts.length; await prepare(root, "one"); expect(model.prompts).toHaveLength(forgotten + 1);
});

it("uses native real paths including Windows junctions and does not classify tasks or call summaries for short history", async () => {
  const root = await project(), aliasRoot = await project(), alias = path.join(aliasRoot, "项目 link");
  await symlink(root, alias, process.platform === "win32" ? "junction" : "dir");
  const store = new ConversationContextStore(), model = new SummaryModel(), short = [new HumanMessage("A"), new AIMessage("Done"), new HumanMessage("B")];
  const identity = await store.prepare({ root, threadId: "one", messages: short, ...setup(model) });
  expect(identity(short)).toBe(short); expect(model.prompts).toHaveLength(0);
  const messages = [...history(), new HumanMessage("B")];
  await store.prepare({ root, threadId: "one", messages, ...setup(model) }); const calls = model.prompts.length;
  await store.prepare({ root: alias, threadId: "one", messages, ...setup(model) }); expect(model.prompts).toHaveLength(calls);
});

it("retains originals after summary failure, cancellation and when explicitly disabled", async () => {
  const root = await project(), messages = [...history(), new HumanMessage("Task B")], store = new ConversationContextStore();
  const fixture = setup(); fixture.model.fail = true;
  const projectInput = await store.prepare({ root, threadId: "one", messages, ...fixture });
  expect(projectInput(messages)).toBe(messages); expect(fixture.logs.at(-1).event).toBe("conversation_projection_failed");
  fixture.model.fail = false;
  const disabled = setup(fixture.model); disabled.window.environment.CREATOR_CONTEXT_HISTORY_TOKENS = "0";
  const calls = fixture.model.prompts.length;
  expect((await store.prepare({ root, threadId: "one", messages, ...disabled }))(messages)).toBe(messages);
  expect(fixture.model.prompts).toHaveLength(calls);
  const controller = new AbortController(); controller.abort(new Error("user stopped"));
  await expect(store.prepare({ root, threadId: "one", messages, ...setup(fixture.model, controller.signal) })).rejects.toThrow("user stopped");
  expect(messages[0]!.content).toBe(history()[0]!.content);
});

it("cancels an in-flight incremental summary without replacing the previously reusable prefix", async () => {
  const root = await project(), store = new ConversationContextStore(), healthy = setup();
  const messages = [...history(), new HumanMessage("Task B")];
  await store.prepare({ root, threadId: "one", messages, ...healthy });
  const calls = healthy.model.prompts.length;
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const finish = new Promise<void>(resolve => { release = resolve; });
  class PausedSummary extends SummaryModel {
    override async _generate(input: BaseMessage[]) { entered(); await finish; return super._generate(input); }
  }
  const controller = new AbortController(), pending = setup(new PausedSummary(), controller.signal);
  const extended = [...messages, new AIMessage("B finished"), ...history(), new HumanMessage("Task C")];
  const preparing = store.prepare({ root, threadId: "one", messages: extended, ...pending });
  await started;
  controller.abort(new Error("stop incremental summary")); release();
  await expect(preparing).rejects.toThrow("stop incremental summary");
  const next = setup(healthy.model);
  const projectInput = await store.prepare({ root, threadId: "one", messages, ...next });
  expect(healthy.model.prompts).toHaveLength(calls);
  expect(projectInput(messages).at(-1)).toBe(messages.at(-1));
  expect(next.logs.find(row => row.event === "conversation_projection")).toMatchObject({ summaryModelCalls: 0 });
});
