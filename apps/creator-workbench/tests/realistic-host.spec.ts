import { expect, test, type Page } from "@playwright/test";
import type { ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { ensurePluginApplication, handleUIOperatorRequest } from "@za38.03/agent-ui-creator/project/dev";
import { createControlledAgentHost, startRun, finishRun, writeEvent, type ControlledRunInput } from "./support/controlled-agent.js";
import { captureWindowErrors } from "./support/window-errors.js";

const composer = (page: Page) => page.locator(".aui-composer-root").getByRole("textbox");
async function send(page: Page, text: string) { await expect(composer(page)).toBeEditable(); await composer(page).fill(text); await page.locator(".aui-composer-send").click(); }
async function watch(page: Page) { const errors: string[] = []; await captureWindowErrors(page, errors); page.on("pageerror", error => errors.push(error.message)); return errors; }
async function attach(page: Page, name = "report.pdf", mimeType = "application/pdf", buffer = Buffer.from("%PDF-1.4 fixture")) {
  const chooser = page.waitForEvent("filechooser"); await page.getByRole("button", { name: "添加附件", exact: true }).click();
  await (await chooser).setFiles({ name, mimeType, buffer });
}

for (const failBackground of [false, true]) test(`background conversation stays isolated while another is cancelled (error=${failBackground})`, async ({ page }) => {
  const errors = await watch(page);
  const streams = new Map<string, { input: ControlledRunInput; response: ServerResponse; closed: boolean }>();
  const f = await createControlledAgentHost({
    application: origin => ({
      imports: 'import {createHttpConversationDataSource} from "./agent-ui/services/conversations";',
      declarations: `const history=createHttpConversationDataSource({endpoint:${JSON.stringify(`${origin}/history`)}});`,
      props: 'conversationDataSource={history} initialThreadId="A" enableMessageQueue',
    }),
    other(request, response) {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/history/conversations") response.end(JSON.stringify({ conversations: [{ id: "A", title: "工单 A", status: "regular" }, { id: "B", title: "工单 B", status: "regular" }] }));
      else if (request.url?.startsWith("/history/conversation/")) { const id = request.url.split("/").at(-1); response.end(JSON.stringify({ id, title: `工单 ${id}`, state: { values: { messages: [] } } })); }
      else { response.writeHead(404); response.end(); }
    },
    run(input, response) {
      startRun(response, input);
      const item = { input, response, closed: false }; streams.set(input.threadId, item);
      response.once("close", () => { item.closed = true; });
      writeEvent(response, { type: "TEXT_MESSAGE_START", messageId: `${input.threadId}-live`, role: "assistant" });
      writeEvent(response, { type: "TEXT_MESSAGE_CONTENT", messageId: `${input.threadId}-live`, delta: `${input.threadId} live content` });
    },
  });
  try {
    await page.goto(f.hostOrigin); await send(page, "Start A");
    const surface = page.locator('[data-ui-plugin="conversation-surface"]');
    await expect(surface).toContainText("A live content");
    const list = page.locator('[data-ui-plugin="conversation-thread-list"]');
    await list.getByRole("button", { name: "工单 B", exact: true }).click();
    await send(page, "Start B"); await expect(surface).toContainText("B live content");
    await expect(surface).not.toContainText("A live content");
    expect(streams.get("A")!.closed).toBe(false);
    if (failBackground) {
      writeEvent(streams.get("A")!.response, { type: "RUN_ERROR", message: "A background failure", code: "SIMULATED_BACKGROUND" });
      streams.get("A")!.response.end();
      await expect(surface).not.toContainText("A background failure");
      await expect(surface).toContainText("B live content");
    } else {
      writeEvent(streams.get("A")!.response, { type: "TEXT_MESSAGE_CONTENT", messageId: "A-live", delta: " A continued in background" });
    }
    await composer(page).fill("Queued B"); await page.getByRole("button", { name: "加入发送队列", exact: true }).click();
    await expect(page.locator('[data-slot="aui_composer-queue-item"]')).toContainText("Queued B");
    await page.getByRole("button", { name: "停止生成", exact: true }).click();
    await expect.poll(() => streams.get("B")?.closed).toBe(true);
    expect(f.requests).toHaveLength(2);
    await list.getByRole("button", { name: /^工单 A(?:\s+运行中)?$/ }).click();
    await expect(surface).toContainText("A live content");
    await expect(surface).not.toContainText("B live content");
    await expect(page.locator('[data-slot="aui_composer-queue-item"]')).toHaveCount(0);
    if (failBackground) await expect(surface).toContainText("A background failure");
    else {
      await expect(surface).toContainText("A continued in background");
      expect(streams.get("A")!.closed).toBe(false);
      writeEvent(streams.get("A")!.response, { type: "TEXT_MESSAGE_END", messageId: "A-live" });
      writeEvent(streams.get("A")!.response, { type: "RUN_FINISHED", threadId: "A", runId: streams.get("A")!.input.runId });
      streams.get("A")!.response.end();
    }
    await list.getByRole("button", { name: "工单 B", exact: true }).click();
    await expect(page.locator('[data-slot="aui_composer-queue-item"]')).toContainText("Queued B");
    expect(f.requests).toHaveLength(2);
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("cancelling a stalled upload restores the draft and keeps text send usable", async ({ page }) => {
  const errors = await watch(page);
  let uploads = 0, cancelled = false;
  const f = await createControlledAgentHost({
    application: origin => ({ props: `attachments={{uploadUrl:${JSON.stringify(`${origin}/upload`)}}}` }),
    other(request, response) {
      if (request.url !== "/upload") { response.writeHead(404); response.end(); return; }
      uploads++; response.once("close", () => { cancelled = true; });
      // Deliberately do not reply: the user must retain a working cancellation.
    },
    run(input, response) { startRun(response, input); finishRun(response, input, "Recovered after cancelled upload"); },
  });
  try {
    await page.goto(f.hostOrigin); await attach(page); await send(page, "Preserve stalled-upload draft");
    await expect.poll(() => uploads).toBe(1);
    await page.getByRole("button", { name: "取消发送", exact: true }).click();
    await expect.poll(() => cancelled).toBe(true);
    expect(f.requests).toHaveLength(0);
    await expect(composer(page)).toHaveValue("Preserve stalled-upload draft");
    await page.getByRole("button", { name: "移除 report.pdf", exact: true }).click();
    await page.locator(".aui-composer-send").click();
    await expect(page.locator(".aui-md")).toContainText("Recovered after cancelled upload");
    expect(f.requests).toHaveLength(1); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

for (const kind of ["unsafe-url", "missing-url", "invalid-json"]) test(`upload response ${kind} fails visibly and a later valid upload succeeds`, async ({ page }) => {
  const errors = await watch(page);
  let uploads = 0;
  const f = await createControlledAgentHost({
    application: origin => ({ props: `attachments={{uploadUrl:${JSON.stringify(`${origin}/upload`)}}}` }),
    other(request, response) {
      if (request.url !== "/upload") { response.writeHead(404); response.end(); return; }
      uploads++; response.setHeader("Content-Type", "application/json");
      response.end(uploads > 1 ? '{"url":"https://files.example.test/report.pdf"}' : kind === "invalid-json" ? "{broken" : JSON.stringify(kind === "unsafe-url" ? { url: "javascript:alert(1)" } : {}));
    },
    run(input, response) { startRun(response, input); finishRun(response, input, "Valid upload accepted"); },
  });
  try {
    await page.goto(f.hostOrigin); await attach(page); await send(page, "Keep upload draft");
    const failed = page.getByRole("group", { name: "文档附件 report.pdf，上传失败", exact: true });
    await expect(failed).toBeVisible(); await failed.hover();
    await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toContainText(kind === "invalid-json" ? "数据格式不正确" : "有效的文件 URL");
    expect(f.requests).toHaveLength(0); await expect(composer(page)).toHaveValue("Keep upload draft");
    await page.getByRole("button", { name: "移除 report.pdf", exact: true }).click(); await attach(page);
    await page.locator(".aui-composer-send").click();
    await expect(page.locator(".aui-md")).toContainText("Valid upload accepted");
    expect(uploads).toBe(2); expect(f.requests).toHaveLength(1);
    expect(JSON.stringify(f.requests[0]!.messages.at(-1)!.content)).toContain("https://files.example.test/report.pdf");
    expect(JSON.stringify(f.requests)).not.toContain("javascript:");
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

for (const kind of ["size", "type"]) test(`rejected attachment ${kind} has visible feedback and preserves the draft`, async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({ application: () => ({ props: 'attachments={{accept:".pdf",maxSizeBytes:32}}' }),
    run(input, response) { startRun(response, input); finishRun(response, input, "Usable after rejected file"); },
  });
  try {
    await page.goto(f.hostOrigin); await composer(page).fill("Draft survives invalid file");
    await attach(page, kind === "size" ? "large.pdf" : "program.exe", kind === "size" ? "application/pdf" : "application/octet-stream", Buffer.alloc(kind === "size" ? 64 : 8));
    await expect(page.getByRole("alert")).toContainText(kind === "size" ? "大小限制" : "不支持选择此类型");
    await expect(composer(page)).toHaveValue("Draft survives invalid file");
    expect(f.requests).toHaveLength(0);
    await page.locator(".aui-composer-send").click();
    await expect(page.locator(".aui-md")).toContainText("Usable after rejected file");
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(f.requests).toHaveLength(1); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("HTTP auth failure, expiry during streaming and failed remote logout revoke the session without leaking history", async ({ page }) => {
  const errors = await watch(page);
  let signIns = 0, signOuts = 0;
  let authEvents: ServerResponse | undefined;
  const active = new Map<number, { response: ServerResponse; closed: boolean }>();
  const f = await createControlledAgentHost({
    async prepareHost(root, origin) {
      await ensurePluginApplication(root, "auth-gate");
      await ensurePluginApplication(root, "auth-account");
      const model = await readFile(path.join(root, "src/agent-ui/app-ui.json"), "utf8");
      const result = await handleUIOperatorRequest({ operation: "mutate_app_ui_model", input: {
        appUIModelHash: createHash("sha256").update(model).digest("hex"),
        operations: [
          { type: "insert_plugin", target: { type: "application" }, plugin: { id: "auth-gate-fixture", pluginId: "auth-gate", enabled: true } },
          { type: "insert_layout_relative", anchorRef: "l0", direction: "above", size: "auto", anchorSize: "minmax(0, 1fr)", node: { type: "slot", plugins: [{ id: "auth-account-fixture", pluginId: "auth-account", enabled: true }] } },
        ],
      } }, root);
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
      // Configure only the generated project's Host-owned adapter seam. This
      // fixture has no real credentials and never takes over Plugin source.
      await writeFile(path.join(root, "src/agent-ui/plugins/auth-gate/host-auth-adapter.ts"), `
        import type {AuthAdapter} from "@za38.03/agent-ui-plugins/auth-gate";
        const origin=${JSON.stringify(origin)};
        async function request(url:string,body?:unknown){const response=await fetch(origin+url,body===undefined?{}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(!response.ok)throw new Error("FIXTURE_AUTH_HTTP_FAILURE");return response.json();}
        export function createHostAuthAdapter():AuthAdapter{return {
          restore:()=>request("/auth/restore"),signIn:input=>request("/auth/sign-in",input),signOut:()=>request("/auth/sign-out",{}),
          subscribe(listener){const events=new EventSource(origin+"/auth/events");events.onmessage=event=>listener(JSON.parse(event.data));return ()=>events.close();}
        };}
      `);
    },
    other(request, response) {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/auth/restore") response.end("null");
      else if (request.url === "/auth/events") {
        response.setHeader("Content-Type", "text/event-stream"); response.write(": connected\n\n"); authEvents = response;
      } else if (request.url === "/auth/sign-in") {
        signIns++;
        if (signIns === 1) { response.writeHead(503); response.end('{"error":"temporary auth outage"}'); }
        else response.end(JSON.stringify({ userId: `user-${signIns}`, userName: `模拟用户 ${signIns}` }));
      } else if (request.url === "/auth/sign-out") {
        signOuts++; response.writeHead(503); response.end('{"error":"remote logout unavailable"}');
      } else { response.writeHead(404); response.end(); }
    },
    run(input, response, index) {
      startRun(response, input);
      const item = { response, closed: false }; active.set(index, item); response.once("close", () => { item.closed = true; });
      writeEvent(response, { type: "TEXT_MESSAGE_START", messageId: `private-${index}`, role: "assistant" });
      writeEvent(response, { type: "TEXT_MESSAGE_CONTENT", messageId: `private-${index}`, delta: `Private answer for session ${index}` });
    },
  });
  async function signIn() {
    await page.getByRole("textbox", { name: "账号", exact: true }).fill("fixture-user");
    await page.getByLabel("密码", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "登录", exact: true }).click();
  }
  try {
    await page.goto(f.hostOrigin);
    await expect(page.getByRole("heading", { name: "登录你的 Agent" })).toBeVisible();
    expect(f.requests).toHaveLength(0); await signIn();
    await expect(page.getByRole("alert")).toContainText("登录失败");
    await expect(page.getByLabel("密码", { exact: true })).toHaveValue("");
    expect(f.requests).toHaveLength(0); await signIn();
    await send(page, "First private request"); await expect(page.locator(".aui-md")).toContainText("Private answer for session 1");
    await expect.poll(() => !!authEvents).toBe(true); authEvents!.write("data: null\n\n");
    await expect(page.getByRole("heading", { name: "登录你的 Agent" })).toBeVisible();
    await expect.poll(() => active.get(1)?.closed).toBe(true);
    await expect(page.locator(".aui-composer-root")).toHaveCount(0);
    await signIn(); await expect(composer(page)).toBeEditable();
    await expect(page.locator("body")).not.toContainText("Private answer for session 1");
    await send(page, "Second private request"); await expect(page.locator(".aui-md")).toContainText("Private answer for session 2");
    expect(JSON.stringify(f.requests[1]!.messages)).not.toContain("First private request");
    await page.getByRole("button", { name: "账户菜单", exact: true }).click();
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect.poll(() => active.get(2)?.closed).toBe(true);
    await expect(page.getByRole("alert")).toContainText("已退出本地会话，远程退出失败");
    expect(signOuts).toBe(1); await signIn(); await expect(composer(page)).toBeEditable();
    await expect(page.locator("body")).not.toContainText("Private answer for session 2");
    expect(f.requests).toHaveLength(2); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});
