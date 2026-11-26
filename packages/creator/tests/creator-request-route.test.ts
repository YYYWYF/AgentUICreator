import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { CreatorAgentRuntime } from "../src/agent/runner.js";

const state = vi.hoisted(() => ({
  model: undefined as BaseChatModel | undefined,
  threads: [] as string[],
}));
vi.mock("../src/agent/config.js", () => ({
  hostEnvironment: () => ({ CREATOR_AGENT_MODE: "domain-write" }),
  createModel: (_environment: unknown, thread: string) => {
    state.threads.push(thread);
    return state.model;
  },
}));

class ConversationModel extends BaseChatModel {
  calls = 0;
  prompts: BaseMessage[][] = [];
  _llmType() { return "creator-conversation-regression"; }
  bindTools() { return this; }
  async _generate(messages: BaseMessage[]) {
    this.prompts.push(messages);
    const message = this.answer(this.calls++);
    return { generations: [{ text: "", message }] };
  }
  constructor(readonly answer: (index: number) => AIMessage) { super({}); }
}

const roots: string[] = [];
afterEach(async () => {
  state.model = undefined;
  state.threads = [];
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function project() {
  const root = await mkdtemp(path.join(tmpdir(), "creator conversation 中文 "));
  roots.push(root);
  for (const directory of [".agent-ui", "skills", "src"]) await mkdir(path.join(root, directory));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ sourceRoot: "src" }));
  await writeFile(path.join(root, "src/styles.css"), ".conversation { background-color: white; }\n");
  return root;
}
const contracts = fileURLToPath(new URL("../contracts/creator", import.meta.url));

it.each([
  "我想修改对话区的背景颜色，该写什么样式呢？",
  "怎么修改对话区背景？",
  "What CSS should I write to change the conversation background?",
  "你能做什么？",
  "先不要改文件，解释一下背景样式怎么写。",
])("answers directly through the main Agent without a request classifier: %s", async request => {
  const root = await project();
  const answer = "可以在对话区容器上设置 background-color: #f5f5f5。";
  const model = state.model = new ConversationModel(() => new AIMessage(answer));
  const events: Record<string, unknown>[] = [];
  await new CreatorAgentRuntime(root, path.join(root, "skills"), contracts).run({
    threadId: "conversation", runId: "conversation-1", messages: [{ role: "user", content: request }],
  }, new AbortController().signal, async event => { events.push(event); });
  expect(state.threads).toEqual(["conversation"]);
  expect(model.calls).toBe(1);
  expect(JSON.stringify(model.prompts[0])).toContain(request);
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success", toolProtocol: { modelCalls: 1, toolCalls: 0 } } });
  expect(events.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join("")).toContain(answer);
  expect(await readFile(path.join(root, "src/styles.css"), "utf8")).toBe(".conversation { background-color: white; }\n");
});

it("can inspect current styles and answer without requiring a project mutation", async () => {
  const root = await project();
  const model = state.model = new ConversationModel(index => index === 0
    ? new AIMessage({ content: "", tool_calls: [{ name: "read_file", args: { file_path: "/src/styles.css" }, id: "styles", type: "tool_call" }] })
    : new AIMessage("当前背景是 white，可以把 background-color 的值改为 #f5f5f5。"));
  const events: Record<string, unknown>[] = [];
  await new CreatorAgentRuntime(root, path.join(root, "skills"), contracts).run({
    threadId: "styles", runId: "styles-1", messages: [{ role: "user", content: "看看现有样式，告诉我对话区背景应该怎么改，不要直接改文件。" }],
  }, new AbortController().signal, async event => { events.push(event); });
  expect(state.threads).toEqual(["styles"]);
  expect(model.calls).toBe(2);
  expect(events.at(-1)).toMatchObject({ result: { completion: "success", receipt: { files: [] }, toolProtocol: { modelCalls: 2, toolCalls: 1 } } });
  expect(await readFile(path.join(root, "src/styles.css"), "utf8")).toContain("background-color: white");
});
