import { expect, test, type Page } from "@playwright/test";
import type { ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { handleUIOperatorRequest, installOfficialAgentUIResource } from "@za38.03/agent-ui-creator/project/dev";
import { createControlledAgentHost, startRun, finishRun, writeEvent, type ControlledRunInput } from "./support/controlled-agent.js";
import { captureWindowErrors } from "./support/window-errors.js";

const composer = (page: Page) => page.locator(".aui-composer-root").getByRole("textbox");
async function send(page: Page, text: string) { await expect(composer(page)).toBeEditable(); await composer(page).fill(text); await page.locator(".aui-composer-send").click(); }
async function watch(page: Page) { const errors: string[] = []; await captureWindowErrors(page, errors); page.on("pageerror", error => errors.push(error.message)); return errors; }

test("editing can be cancelled, submitted and switched between user branches without another request", async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({ run(input, response, index) { startRun(response, input); finishRun(response, input, `Reply for branch ${index}`); } });
  try {
    await page.goto(f.hostOrigin); await send(page, "Original branch question");
    await expect(page.locator(".aui-md")).toContainText("Reply for branch 1");
    const user = page.locator('[data-role="user"]');
    await user.hover(); await user.getByRole("button", { name: "编辑", exact: true }).click();
    const edit = page.locator('[data-slot="agent-ui-edit-composer"]');
    await edit.getByRole("textbox").fill("Discarded branch edit"); await edit.getByRole("button", { name: "取消", exact: true }).click();
    await expect(user).toContainText("Original branch question"); expect(f.requests).toHaveLength(1);
    await user.hover(); await user.getByRole("button", { name: "编辑", exact: true }).click();
    await edit.getByRole("textbox").fill("Updated branch question"); await edit.getByRole("button", { name: "更新", exact: true }).click();
    await expect(page.locator(".aui-md")).toContainText("Reply for branch 2");
    expect(f.requests).toHaveLength(2);
    expect(f.requests[1]!.messages.filter(message => message.role === "user")).toMatchObject([{ content: "Updated branch question" }]);
    const branches = user.locator(".aui-branch-picker-root");
    await branches.getByRole("button", { name: "上一项", exact: true }).click();
    await expect(user).toContainText("Original branch question"); await expect(page.locator(".aui-md")).toContainText("Reply for branch 1");
    await branches.getByRole("button", { name: "下一项", exact: true }).click();
    await expect(user).toContainText("Updated branch question"); await expect(page.locator(".aui-md")).toContainText("Reply for branch 2");
    expect(f.requests).toHaveLength(2); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

for (const submitted of [false, true]) test(`persisted forms retain their receipt or wait for an explicit answer (submitted=${submitted})`, async ({ page }) => {
  const errors = await watch(page);
  const values = { firstName: "Saved", lastName: "User", email: "saved@example.test", projectIdea: "Read only history" };
  const f = await createControlledAgentHost({
    prepareHost: root => installOfficialAgentUIResource(root, "human-form-demo", { runPackages: async () => { throw new Error("Fixture must use prepared dependencies"); } }).then(() => undefined),
    application: origin => ({
      imports: 'import {createHttpConversationDataSource} from "./agent-ui/services/conversations";',
      declarations: `const history=createHttpConversationDataSource({endpoint:${JSON.stringify(`${origin}/history`)}});`,
      props: 'conversationDataSource={history} initialThreadId="saved-form"',
    }),
    other(request, response) {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/history/conversations") response.end(JSON.stringify({ conversations: [{ id: "saved-form", title: "已保存的表单" }] }));
      else if (request.url === "/history/conversations/saved-form") response.end(JSON.stringify({ id: "saved-form", title: "已保存的表单", state: { values: { messages: [
        { id: "saved-user", type: "human", content: "Saved form request" },
        { id: "saved-call", type: "ai", content: "", tool_calls: [{ id: "saved-form-tool", name: "collect_user_details", args: {}, type: "tool_call" }] },
        ...(submitted ? [{ id: "saved-tool-result", type: "tool", tool_call_id: "saved-form-tool", content: JSON.stringify({ values }) }] : []),
      ] } } }));
      else { response.writeHead(404); response.end(); }
    },
    run(input, response) { startRun(response, input); finishRun(response, input, "New thread remains usable"); },
  });
  try {
    await page.goto(f.hostOrigin); await expect(page.locator('[data-role="user"]')).toContainText("Saved form request");
    await expect(page.locator(".human-details-form")).toBeVisible();
    expect(f.requests).toHaveLength(0);
    if (submitted) {
      await expect(page.locator("form.human-details-form")).toHaveCount(0);
      await expect(page.locator(".human-details-form")).toContainText("saved@example.test");
      await expect(page.locator(".human-details-form").getByRole("button", { name: "提交", exact: true })).toHaveCount(0);
    } else {
      // A persisted active thread may intentionally restore an unanswered human
      // tool. It must wait for the user instead of replaying a submission.
      const form = page.locator("form.human-details-form");
      await form.getByRole("textbox", { name: "名", exact: true }).fill("Restored");
      await form.getByRole("textbox", { name: "邮箱", exact: true }).fill("restored@example.test");
      await form.getByRole("button", { name: "提交", exact: true }).click();
      await expect(page.locator("form.human-details-form")).toHaveCount(0);
      await expect(page.locator(".aui-md")).toContainText("New thread remains usable");
      expect(f.requests).toHaveLength(1);
      expect(f.requests[0]!.messages.filter(message => message.role === "tool")).toMatchObject([{ toolCallId: "saved-form-tool", content: expect.stringContaining("restored@example.test") }]);
    }
    const previousRequests = f.requests.length;
    await page.getByRole("button", { name: "新建会话", exact: true }).click(); await send(page, "Fresh thread after form history");
    await expect(page.locator(".aui-md")).toContainText("New thread remains usable");
    expect(f.requests).toHaveLength(previousRequests + 1); expect(f.requests.at(-1)!.messages.some(message => message.role === "tool")).toBe(false);
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("cancelling parallel Host tools closes both requests and suppresses their cancelled continuations", async ({ page }) => {
  const errors = await watch(page);
  const pending = new Map<string, { response: ServerResponse; closed: boolean }>();
  const f = await createControlledAgentHost({
    application: origin => ({
      imports: 'import {createAgentUIFrontendTools} from "@za38.03/agent-ui-runtime";',
      declarations: `const tools=createAgentUIFrontendTools([{name:"parallel_host_task",description:"Pending fixture task",inputSchema:{type:"object",properties:{},additionalProperties:false},async execute(_input,{signal,toolCallId}){const response=await fetch(${JSON.stringify(origin)}+"/hold/"+toolCallId,{signal});return response.json();}}]);`,
      props: 'frontendTools={tools}',
    }),
    other(request, response) {
      if (!request.url?.startsWith("/hold/")) { response.writeHead(404); response.end(); return; }
      const item = { response, closed: false }; pending.set(request.url, item); response.once("close", () => { item.closed = true; });
    },
    run(input, response, index) {
      startRun(response, input);
      if (index > 1) { finishRun(response, input, "Recovered after parallel tool cancellation"); return; }
      for (const toolCallId of ["parallel-1", "parallel-2"]) {
        writeEvent(response, { type: "TOOL_CALL_START", toolCallId, toolCallName: "parallel_host_task" });
        writeEvent(response, { type: "TOOL_CALL_ARGS", toolCallId, delta: "{}" }); writeEvent(response, { type: "TOOL_CALL_END", toolCallId });
      }
      writeEvent(response, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }); response.end();
    },
  });
  try {
    await page.goto(f.hostOrigin); await send(page, "Run two page tasks"); await expect.poll(() => pending.size).toBe(2);
    await page.getByRole("button", { name: "停止生成", exact: true }).click();
    await expect.poll(() => [...pending.values()].filter(item => item.closed).length).toBe(2);
    await expect(composer(page)).toBeEditable(); expect(f.requests).toHaveLength(1);
    await send(page, "Fresh message after both cancellations");
    await expect(page.locator(".aui-md")).toContainText("Recovered after parallel tool cancellation");
    expect(f.requests).toHaveLength(2); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("failed history deletion retains the selected thread and a successful retry stays deleted after reload", async ({ page }) => {
  const errors = await watch(page); let deletes = 0, removed = false;
  const f = await createControlledAgentHost({
    application: origin => ({ imports: 'import {createHttpConversationDataSource} from "./agent-ui/services/conversations";', declarations: `const history=createHttpConversationDataSource({endpoint:${JSON.stringify(`${origin}/history`)}});`, props: 'conversationDataSource={history} initialThreadId="deletable"' }),
    other(request, response) {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/history/conversations" && request.method === "GET") response.end(JSON.stringify({ conversations: removed ? [] : [{ id: "deletable", title: "删除测试工单" }] }));
      else if (request.url === "/history/conversations/deletable" && request.method === "GET") response.end(JSON.stringify({ id: "deletable", title: "删除测试工单", state: { values: { messages: [{ id: "saved-delete-user", type: "human", content: "Keep history on failed delete" }] } } }));
      else if (request.url === "/history/conversations/deletable" && request.method === "DELETE") { deletes++; if (deletes === 1) { response.writeHead(503); response.end('{"error":"fixture deletion outage"}'); } else { removed = true; response.writeHead(204); response.end(); } }
      else { response.writeHead(404); response.end(); }
    },
    run(input, response) { startRun(response, input); finishRun(response, input, "Fresh after deleting history"); },
  });
  try {
    await page.goto(f.hostOrigin); await expect(page.locator('[data-role="user"]')).toContainText("Keep history on failed delete");
    await composer(page).fill("Draft survives failed delete");
    const list = page.locator('[data-ui-plugin="conversation-thread-list"]');
    const remove = async () => { const row = list.locator('[data-slot="aui_thread-list-item"]').filter({ hasText: "删除测试工单" }); await row.hover(); await row.getByRole("button", { name: "更多选项", exact: true }).click(); await page.locator('[data-slot="agent-ui-thread-action-delete"]').click(); };
    await remove(); await expect.poll(() => deletes).toBe(1);
    await expect(list).toContainText("删除测试工单");
    await list.getByRole("button", { name: "删除测试工单", exact: true }).click();
    await expect(page.locator('[data-role="user"]')).toContainText("Keep history on failed delete");
    await expect(composer(page)).toHaveValue("Draft survives failed delete");
    await remove(); await expect.poll(() => removed).toBe(true); await expect(list).not.toContainText("删除测试工单");
    await send(page, "New conversation after deletion"); await expect(page.locator(".aui-md")).toContainText("Fresh after deleting history");
    expect(f.requests[0]!.threadId).not.toBe("deletable"); await page.reload(); await expect(list).not.toContainText("删除测试工单");
    expect(deletes).toBe(2); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("ordinary workspace recomposition revokes its old session and preserves application code through stale refusal and reinsertion", async ({ page }) => {
  const errors = await watch(page);
  let closed = false;
  const f = await createControlledAgentHost({ run(input, response, index) {
    startRun(response, input);
    if (index > 1) { finishRun(response, input, "Usable after composition changes"); return; }
    response.once("close", () => { closed = true; });
    writeEvent(response, { type: "TEXT_MESSAGE_START", messageId: "composition-live", role: "assistant" });
    writeEvent(response, { type: "TEXT_MESSAGE_CONTENT", messageId: "composition-live", delta: "Active through composition changes" });
  } });
  const modelFile = path.join(f.hostRoot, "src/agent-ui/app-ui.json");
  const applicationFile = path.join(f.hostRoot, "src/agent-ui/plugins/add-attachment-action/index.tsx");
  const application = await readFile(applicationFile, "utf8");
  const originalSource = await readFile(modelFile, "utf8");
  const inspected = await handleUIOperatorRequest({ operation: "inspect_app_ui_model", input: {} }, f.hostRoot);
  expect(inspected, JSON.stringify(inspected)).toMatchObject({ ok: true });
  const findPlugin = (value: unknown): ({ id: string; pluginId: string } & Record<string, unknown>) | undefined => {
    if (!value || typeof value !== "object") return;
    if ("pluginId" in value && value.pluginId === "add-attachment-action" && "id" in value && typeof value.id === "string") return value as { id: string; pluginId: string } & Record<string, unknown>;
    for (const child of Object.values(value)) { const found = findPlugin(child); if (found) return found; }
  };
  const plugin = findPlugin((inspected as { result: { model: unknown } }).result.model)!;
  const originalHash = createHash("sha256").update(originalSource).digest("hex");
  const mutate = async (operation: object) => {
    const source = await readFile(modelFile, "utf8");
    const result = await handleUIOperatorRequest({ operation: "mutate_app_ui_model", input: { appUIModelHash: createHash("sha256").update(source).digest("hex"), operations: [operation] } }, f.hostRoot);
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  };
  try {
    await page.goto(f.hostOrigin); await send(page, "Start a run before composition changes");
    await expect(page.locator(".aui-md")).toContainText("Active through composition changes");
    await composer(page).fill("Draft through composition changes");
    await mutate({ type: "set_plugin_enabled", instanceId: plugin.id, enabled: false });
    await expect(page.getByRole("button", { name: "添加附件", exact: true })).toHaveCount(0);
    // Unlike a scoped renderer substitution, ordinary workspace recomposition
    // rebuilds service owners, including the conversation binding capability.
    await expect.poll(() => closed).toBe(true);
    await expect(composer(page)).toHaveValue("");
    const disabled = await readFile(modelFile, "utf8");
    const stale = await handleUIOperatorRequest({ operation: "mutate_app_ui_model", input: { appUIModelHash: originalHash, operations: [{ type: "set_plugin_enabled", instanceId: plugin.id, enabled: true }] } }, f.hostRoot);
    expect(stale).toMatchObject({ ok: false }); expect(await readFile(modelFile, "utf8")).toBe(disabled);
    await mutate({ type: "set_plugin_enabled", instanceId: plugin.id, enabled: true });
    await expect(page.getByRole("button", { name: "添加附件", exact: true })).toBeVisible();
    await mutate({ type: "remove_plugin_default", instanceId: plugin.id });
    await expect(page.getByRole("button", { name: "添加附件", exact: true })).toHaveCount(0);
    expect(await readFile(applicationFile, "utf8")).toBe(application);
    await mutate({ type: "insert_plugin_default", plugin });
    await expect(page.getByRole("button", { name: "添加附件", exact: true })).toBeVisible();
    await expect(composer(page)).toHaveValue("");
    expect(await readFile(applicationFile, "utf8")).toBe(application);
    expect(closed).toBe(true); expect(f.requests).toHaveLength(1);
    await expect(page.getByRole("button", { name: "停止生成", exact: true })).toHaveCount(0);
    await send(page, "Fresh request after composition changes"); await expect(page.locator(".aui-md").last()).toContainText("Usable after composition changes");
    expect(f.requests).toHaveLength(2); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});
