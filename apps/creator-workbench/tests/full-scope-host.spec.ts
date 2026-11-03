import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { ServerResponse } from "node:http";
import { ensurePluginApplication, handleUIOperatorRequest, installOfficialAgentUIResource } from "@za38.03/agent-ui-creator/project/dev";
import { createControlledAgentHost, startRun, finishRun, writeEvent, type ControlledRunInput } from "./support/controlled-agent.js";
import { captureWindowErrors } from "./support/window-errors.js";

const composer = (page: Page) => page.locator(".aui-composer-root").getByRole("textbox");
async function send(page: Page, text: string) {
  await expect(composer(page)).toBeEditable(); await composer(page).fill(text);
  await page.locator(".aui-composer-send").click();
}
async function watch(page: Page) {
  const errors: string[] = []; await captureWindowErrors(page, errors);
  page.on("pageerror", error => errors.push(error.message)); return errors;
}
function toolCall(response: ServerResponse, input: ControlledRunInput, name: string, args: object) {
  startRun(response, input);
  writeEvent(response, { type: "TOOL_CALL_START", toolCallId: "interactive-tool", toolCallName: name });
  writeEvent(response, { type: "TOOL_CALL_ARGS", toolCallId: "interactive-tool", delta: JSON.stringify(args) });
  writeEvent(response, { type: "TOOL_CALL_END", toolCallId: "interactive-tool" });
  writeEvent(response, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId });
  response.end();
}

test("failed feedback reports to the Host and a later rating succeeds without restarting inference", async ({ page }) => {
  const errors = await watch(page);
  const feedback: unknown[] = [];
  const f = await createControlledAgentHost({
    async prepareHost(root) {
      await ensurePluginApplication(root, "feedback-actions");
      const model = await readFile(path.join(root, "src/agent-ui/app-ui.json"), "utf8");
      const result = await handleUIOperatorRequest({ operation: "mutate_app_ui_model", input: {
        appUIModelHash: createHash("sha256").update(model).digest("hex"),
        operations: [{ type: "insert_plugin_default", plugin: { id: "feedback-fixture", pluginId: "feedback-actions", enabled: true } }],
      } }, root);
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    },
    application: origin => ({
      declarations: 'const hostErrors:string[]=[];Object.assign(window,{hostErrors});',
      props: `feedback={{url:${JSON.stringify(`${origin}/feedback`)}}} onError={error=>hostErrors.push(error.message)}`,
    }),
    other(request, response, body) {
      if (request.url !== "/feedback") { response.writeHead(404); response.end(); return; }
      feedback.push(JSON.parse(body.toString()));
      response.writeHead(feedback.length === 1 ? 503 : 204); response.end();
    },
    run(input, response) { startRun(response, input); finishRun(response, input, "Response available for feedback"); },
  });
  try {
    await page.goto(f.hostOrigin); await send(page, "Rate this response");
    await expect(page.locator(".aui-md")).toContainText("Response available for feedback");
    await composer(page).fill("Keep this feedback draft");
    await page.getByRole("button", { name: "有帮助", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as Window & { hostErrors?: string[] }).hostErrors)).toEqual([expect.stringContaining("503")]);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "没有帮助", exact: true }).click();
    await expect.poll(() => feedback.length).toBe(2);
    expect(feedback).toEqual([
      expect.objectContaining({ threadId: f.requests[0]!.threadId, messageId: `answer-${f.requests[0]!.runId}`, type: "positive" }),
      expect.objectContaining({ threadId: f.requests[0]!.threadId, messageId: `answer-${f.requests[0]!.runId}`, type: "negative" }),
    ]);
    await expect(composer(page)).toHaveValue("Keep this feedback draft");
    expect(f.requests).toHaveLength(1); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("conversation form validates fields, submits once on a double click and becomes a submitted summary", async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({
    prepareHost: root => installOfficialAgentUIResource(root, "human-form-demo", {
      runPackages: async () => { throw new Error("Prepared dependencies must satisfy the demo form"); },
    }).then(() => undefined),
    run(input, response, index) {
      if (index === 1) toolCall(response, input, "collect_user_details", {});
      else { startRun(response, input); finishRun(response, input, "Form submitted once"); }
    },
  });
  try {
    await page.goto(f.hostOrigin); await send(page, "Collect my details");
    const form = page.locator("form.human-details-form");
    await expect(form).toBeVisible(); await form.getByRole("button", { name: "提交", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("无效字段"); expect(f.requests).toHaveLength(1);
    await form.getByRole("textbox", { name: "名", exact: true }).fill("Test");
    await form.locator('input[type="email"]').fill("invalid-email");
    await form.getByRole("button", { name: "提交", exact: true }).click();
    await expect(form.getByRole("alert")).toBeVisible(); expect(f.requests).toHaveLength(1);
    await form.locator('input[type="email"]').fill("fixture@example.test");
    await form.getByRole("button", { name: "提交", exact: true }).dblclick();
    await expect(page.locator(".aui-md")).toContainText("Form submitted once");
    await expect(page.locator(".human-details-form")).toContainText("fixture@example.test");
    await expect(page.locator("form.human-details-form")).toHaveCount(0);
    expect(f.requests).toHaveLength(2);
    expect(f.requests[1]!.messages.filter(message => message.role === "tool")).toMatchObject([{ toolCallId: "interactive-tool", content: JSON.stringify({ values: { firstName: "Test", lastName: "", email: "fixture@example.test", projectIdea: "" } }) }]);
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

for (const cancel of [false, true]) test(`Host frontend tool rejection and cancellation remain recoverable (cancel=${cancel})`, async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({
    application: () => ({
      imports: 'import {createAgentUIFrontendTools} from "@za38.03/agent-ui-runtime";',
      declarations: `let started=0,aborted=false;Object.assign(window,{toolState:()=>({started,aborted})});
        const tools=createAgentUIFrontendTools([{name:"open_ticket",description:"Fixture Host operation",inputSchema:{type:"object",properties:{},additionalProperties:false},async execute(_input,{signal}){started++;${cancel ? 'await new Promise<void>(resolve=>signal.addEventListener("abort",()=>{aborted=true;resolve();},{once:true}));signal.throwIfAborted();' : 'throw new Error("FIXTURE_HOST_TOOL_FAILED");'}return {opened:true};}}]);`,
      props: 'frontendTools={tools}',
    }),
    run(input, response, index) {
      if (index === 1) toolCall(response, input, "open_ticket", {});
      else { startRun(response, input); finishRun(response, input, cancel ? "Recovered after tool cancellation" : "Agent handled failed Host operation"); }
    },
  });
  try {
    await page.goto(f.hostOrigin); await send(page, "Open a ticket");
    if (cancel) {
      await expect.poll(() => page.evaluate(() => (window as Window & { toolState?: () => { started: number } }).toolState?.().started)).toBe(1);
      await page.getByRole("button", { name: "停止生成", exact: true }).click();
      await expect.poll(() => page.evaluate(() => (window as Window & { toolState?: () => { aborted: boolean } }).toolState?.().aborted)).toBe(true);
      await expect(composer(page)).toBeEditable(); expect(f.requests).toHaveLength(1);
      await send(page, "Continue after cancelling the page operation");
      await expect(page.locator(".aui-md")).toContainText("Recovered after tool cancellation");
    } else {
      await expect(page.locator(".aui-md")).toContainText("Agent handled failed Host operation");
      expect(f.requests[1]!.messages.filter(message => message.role === "tool")).toMatchObject([{ toolCallId: "interactive-tool", content: expect.stringContaining("FIXTURE_HOST_TOOL_FAILED") }]);
      await expect(composer(page)).toBeEditable();
    }
    expect(f.requests).toHaveLength(2); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("Host locale and theme changes preserve an active wire stream and an unsent draft", async ({ page }) => {
  const errors = await watch(page);
  let stream: ServerResponse | undefined, input: ControlledRunInput | undefined, closed = false;
  const f = await createControlledAgentHost({
    async prepareHost(root, origin) {
      await writeFile(path.join(root, "src/main.tsx"), `
        import {useState} from "react";import {createRoot} from "react-dom/client";import {Agent} from "./agent-ui";import "./host.css";
        function Host(){const [locale,setLocale]=useState<"zh-CN"|"en-US">("zh-CN"),[theme,setTheme]=useState<"light"|"dark">("light");return <><nav style={{position:"fixed",top:0,left:320,zIndex:100}}><button onClick={()=>setLocale(v=>v==="zh-CN"?"en-US":"zh-CN")}>Host language</button><button onClick={()=>setTheme(v=>v==="light"?"dark":"light")}>Host theme</button></nav><Agent endpoint=${JSON.stringify(`${origin}/agent`)} locale={locale} theme={theme}/></>;}
        createRoot(document.getElementById("root")!).render(<Host/>);
      `);
    },
    run(value, response) {
      input = value; stream = response; response.once("close", () => { closed = true; }); startRun(response, value);
      writeEvent(response, { type: "TEXT_MESSAGE_START", messageId: "presentation-stream", role: "assistant" });
      writeEvent(response, { type: "TEXT_MESSAGE_CONTENT", messageId: "presentation-stream", delta: "Before presentation changes" });
    },
  });
  try {
    await page.goto(f.hostOrigin); await send(page, "Keep the stream alive");
    await expect(page.locator(".aui-md")).toContainText("Before presentation changes");
    await composer(page).fill("Keep this unsent draft");
    for (let index = 0; index < 2; index++) {
      await page.getByRole("button", { name: "Host language", exact: true }).click();
      await page.getByRole("button", { name: "Host theme", exact: true }).click();
      await expect(page.getByRole("button", { name: index === 0 ? "Stop generating" : "停止生成", exact: true })).toBeVisible();
      await expect(composer(page)).toHaveValue("Keep this unsent draft"); expect(closed).toBe(false);
    }
    writeEvent(stream!, { type: "TEXT_MESSAGE_CONTENT", messageId: "presentation-stream", delta: " After presentation changes" });
    writeEvent(stream!, { type: "TEXT_MESSAGE_END", messageId: "presentation-stream" });
    writeEvent(stream!, { type: "RUN_FINISHED", threadId: input!.threadId, runId: input!.runId }); stream!.end();
    await expect(page.locator(".aui-md")).toContainText("Before presentation changes After presentation changes");
    await expect(composer(page)).toHaveValue("Keep this unsent draft");
    expect(f.requests).toHaveLength(1); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});
