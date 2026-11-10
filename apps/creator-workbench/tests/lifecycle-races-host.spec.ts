import { expect, test, type Page } from "@playwright/test";
import type { ServerResponse } from "node:http";
import { createControlledAgentHost, startRun, finishRun, writeEvent, type ControlledRunInput } from "./support/controlled-agent.js";
import { captureWindowErrors } from "./support/window-errors.js";

const composer = (page: Page) => page.locator(".aui-composer-root").getByRole("textbox");
async function send(page: Page, text: string) { await expect(composer(page)).toBeEditable(); await composer(page).fill(text); await page.locator(".aui-composer-send").click(); }
async function watch(page: Page) { const errors: string[] = []; await captureWindowErrors(page, errors); page.on("pageerror", error => errors.push(error.message)); return errors; }
function call(response: ServerResponse, toolCallId: string, toolCallName: string, args: object = {}) {
  writeEvent(response, { type: "TOOL_CALL_START", toolCallId, toolCallName });
  writeEvent(response, { type: "TOOL_CALL_ARGS", toolCallId, delta: JSON.stringify(args) });
  writeEvent(response, { type: "TOOL_CALL_END", toolCallId });
}

test("consecutive approval and rejection resume their own interrupt exactly once", async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({ run(input, response, index) {
    startRun(response, input);
    if (index === 3) {
      writeEvent(response, { type: "TOOL_CALL_RESULT", toolCallId: "review-tool-2", messageId: "decision-2", content: '{"skipped":true}' });
      finishRun(response, input, "First allowed, second rejected"); return;
    }
    if (index === 2) writeEvent(response, { type: "TOOL_CALL_RESULT", toolCallId: "review-tool-1", messageId: "decision-1", content: '{"done":true}' });
    const id = `review-tool-${index}`;
    call(response, id, "delete_file", { path: `draft-${index}.txt` });
    writeEvent(response, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, outcome: {
      type: "interrupt", interrupts: [{ id: `review-${index}`, reason: "tool_call", toolCallId: id, message: `Review deletion ${index}`, responseSchema: { type: "object", properties: { approved: { type: "boolean" } }, required: ["approved"] } }],
    } }); response.end();
  } });
  try {
    await page.goto(f.hostOrigin); await send(page, "Two independent decisions");
    await page.getByRole("button", { name: "1 次工具调用", exact: true }).last().click();
    await page.getByRole("button", { name: "允许", exact: true }).click();
    await expect.poll(() => f.requests.length).toBe(2);
    await page.getByRole("button", { name: "1 次工具调用", exact: true }).last().click();
    await page.getByRole("button", { name: "拒绝", exact: true }).click();
    await expect(page.locator(".aui-md").last()).toContainText("First allowed, second rejected");
    expect(f.requests).toHaveLength(3);
    expect(f.requests[1]!.resume).toEqual([{ interruptId: "review-1", status: "resolved", payload: { approved: true } }]);
    expect(f.requests[2]!.resume).toEqual([{ interruptId: "review-2", status: "resolved", payload: { approved: false } }]);
    expect(new Set(f.requests.map(input => input.threadId)).size).toBe(1);
    expect(new Set(f.requests.map(input => input.runId)).size).toBe(3);
    expect(f.requests[1]!.messages.filter(message => message.role === "tool")).toEqual([]);
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("parallel Host tools completing in reverse order trigger one continuation with both results", async ({ page }) => {
  const errors = await watch(page), pending = new Map<string, ServerResponse>();
  const f = await createControlledAgentHost({
    application: origin => ({
      imports: 'import {createAgentUIFrontendTools} from "@za38.03/agent-ui-runtime";',
      declarations: `const completions:string[]=[];(window as Window & {fixtureCompletions?:string[]}).fixtureCompletions=completions;const tools=createAgentUIFrontendTools([{name:"ordered_task",description:"HTTP test task",inputSchema:{type:"object",properties:{},additionalProperties:false},async execute(_input,{signal,toolCallId}){const response=await fetch(${JSON.stringify(origin)}+"/hold/"+toolCallId,{signal});const result=await response.json();completions.push(toolCallId);return result;}}]);`,
      props: 'frontendTools={tools}',
    }),
    other(request, response) { if (request.url?.startsWith("/hold/")) pending.set(request.url, response); else { response.writeHead(404); response.end(); } },
    run(input, response, index) {
      startRun(response, input);
      if (index > 1) { finishRun(response, input, "Both results received once"); return; }
      for (const id of ["slow-first", "fast-second"]) call(response, id, "ordered_task");
      writeEvent(response, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }); response.end();
    },
  });
  try {
    await page.goto(f.hostOrigin); await send(page, "Run parallel tasks");
    await expect.poll(() => pending.size).toBe(2);
    pending.get("/hold/fast-second")!.end(JSON.stringify({ result: "second" }));
    await expect.poll(() => page.evaluate(() => (window as Window & { fixtureCompletions?: string[] }).fixtureCompletions)).toEqual(["fast-second"]);
    expect(f.requests).toHaveLength(1);
    pending.get("/hold/slow-first")!.end(JSON.stringify({ result: "first" }));
    await expect(page.locator(".aui-md")).toContainText("Both results received once");
    expect(f.requests).toHaveLength(2);
    const results = f.requests[1]!.messages.filter(message => message.role === "tool");
    expect(results).toHaveLength(2);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ toolCallId: "slow-first", content: '{"result":"first"}' }),
      expect.objectContaining({ toolCallId: "fast-second", content: '{"result":"second"}' }),
    ]));
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("background replies and drafts stay isolated and stopping the foreground leaves the background running", async ({ page }) => {
  const errors = await watch(page);
  let oldStream: ServerResponse | undefined, oldInput: ControlledRunInput | undefined, closed = false, foregroundClosed = false;
  const f = await createControlledAgentHost({
    application: origin => ({ imports: 'import {createHttpConversationDataSource} from "./agent-ui/services/conversations";', declarations: `const history=createHttpConversationDataSource({endpoint:${JSON.stringify(`${origin}/history`)}});`, props: 'conversationDataSource={history} initialThreadId="thread-a"' }),
    other(request, response) {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/history/conversations") response.end(JSON.stringify({ conversations: ["a", "b"].map(id => ({ id: `thread-${id}`, title: `History ${id}` })) }));
      else if (request.url?.startsWith("/history/conversations/thread-")) {
        const id = request.url.slice(-1); response.end(JSON.stringify({ id: `thread-${id}`, title: `History ${id}`, state: { values: { messages: [{ id: `saved-${id}`, type: "human", content: `Saved message ${id}` }] } } }));
      } else { response.writeHead(404); response.end(); }
    },
    run(input, response, index) {
      startRun(response, input);
      if (index > 1) {
        response.once("close", () => { foregroundClosed = true; });
        writeEvent(response, { type: "TEXT_MESSAGE_START", messageId: "active-b", role: "assistant" });
        writeEvent(response, { type: "TEXT_MESSAGE_CONTENT", messageId: "active-b", delta: "Reply only for history b" });
        return;
      }
      oldStream = response; oldInput = input; response.once("close", () => { closed = true; });
      writeEvent(response, { type: "TEXT_MESSAGE_START", messageId: "active-a", role: "assistant" });
      writeEvent(response, { type: "TEXT_MESSAGE_CONTENT", messageId: "active-a", delta: "Partial reply for a" });
    },
  });
  try {
    await page.goto(f.hostOrigin); await expect(page.locator('[data-role="user"]')).toContainText("Saved message a");
    await send(page, "Active request a"); await expect(page.locator(".aui-md")).toContainText("Partial reply for a");
    await composer(page).fill("Unsent draft a");
    const list = page.locator('[data-ui-plugin="conversation-thread-list"]');
    await list.getByRole("button", { name: "History b", exact: true }).click();
    await expect(page.locator('[data-role="user"][data-message-id="saved-b"]')).toContainText("Saved message b");
    await expect(composer(page)).toHaveValue("");
    // Upstream keeps mounted threads running in the background. Verify the
    // existing independent-thread contract instead of imposing cancellation.
    expect(closed).toBe(false);
    await send(page, "Request b"); await expect(page.locator(".aui-md")).toContainText("Reply only for history b");
    await page.getByRole("button", { name: "停止生成", exact: true }).click();
    await expect.poll(() => foregroundClosed).toBe(true); expect(closed).toBe(false);
    writeEvent(oldStream!, { type: "TEXT_MESSAGE_CONTENT", messageId: "active-a", delta: " Background token a" });
    writeEvent(oldStream!, { type: "TEXT_MESSAGE_END", messageId: "active-a" });
    writeEvent(oldStream!, { type: "RUN_FINISHED", threadId: oldInput!.threadId, runId: oldInput!.runId }); oldStream!.end();
    await expect.poll(() => closed).toBe(true);
    expect(f.requests).toHaveLength(2); expect(f.requests[1]!.threadId).toBe("thread-b");
    expect(JSON.stringify(f.requests[1]!.messages)).not.toMatch(/Saved message a|Active request a|Partial reply for a|Unsent draft a|Late reply/u);
    await expect(page.locator(".aui-md")).toContainText("Reply only for history b");
    await expect(page.getByText("Background token a", { exact: false })).toHaveCount(0);
    await list.getByRole("button", { name: "History a", exact: true }).click();
    await expect(page.locator(".aui-md")).toContainText("Partial reply for a Background token a");
    await expect(composer(page)).toHaveValue("Unsent draft a");
    expect(f.requests).toHaveLength(2); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});
