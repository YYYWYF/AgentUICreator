import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";
import { captureWindowErrors } from "./support/window-errors.js";

const evidence = path.resolve("../../artifacts/agui-runtime-010-20261028");
test("canonical runtime cancels before output and can send a fresh turn", async ({ page }) => {
  const preview = await createConnectionHostFixture();
  const errors: string[] = [];
  await captureWindowErrors(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /React does not recognize/.test(message.text())) errors.push(message.text()); });
  try {
    await page.route(`${preview.creatorOrigin}__agent-ui/creator/workspace`, route => route.fulfill({ json: {
      status: "ready", workspace: { id: preview.workspaceId, name: "Runtime acceptance", displayPath: preview.hostRoot },
      project: { mode: "platform", sourceRoot: "src/agent-ui" }, runtime: { status: "ready" },
    } }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(preview.creatorOrigin);
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "连接 Agent", exact: true }).click();
    await page.getByRole("button", { name: "使用示例 Agent", exact: true }).click();
    await page.getByRole("button", { name: "返回对话", exact: true }).click();
    const host = page.frameLocator('iframe[title="Host Application"]');
    await expect(host.locator(".aui-composer-root").getByRole("textbox")).toBeEditable();
    expect((await page.request.post(`${preview.creatorOrigin}__agent-ui/creator/mock/select`, { data: { scenarioId: "cancel-before-first-output", speed: 1 } })).ok()).toBe(true);
    await host.locator(".aui-composer-root").getByRole("textbox").fill("Stop before output");
    const started = page.waitForResponse(response => response.request().method() === "POST" && response.url().startsWith(`${preview.hostOrigin}__agent-ui/mock`));
    await host.locator(".aui-composer-send").click();
    expect((await started).ok()).toBe(true);
    await host.getByRole("button", { name: "停止生成", exact: true }).click();
    await expect(host.getByText("生成已停止", { exact: true })).toBeVisible();
    await expect(host.locator(".aui-composer-root").getByRole("textbox")).toBeEditable();
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, "cancel-before-output.png"), fullPage: true });
    expect((await page.request.post(`${preview.creatorOrigin}__agent-ui/creator/mock/select`, { data: { scenarioId: "simple-chat", speed: 0 } })).ok()).toBe(true);
    await host.locator(".aui-composer-root").getByRole("textbox").fill("A fresh turn after stop");
    await host.locator(".aui-composer-send").click();
    await expect(host.locator('[data-ui-plugin="conversation-surface"]')).toContainText("你好，这是一个纯文本流式回复。");
    await expect(host.locator('[data-plugin-state="error"]')).toHaveCount(0);
    await page.screenshot({ path: path.join(evidence, "fresh-turn-after-stop.png"), fullPage: true });
    expect(errors).toEqual([]);
  } catch (error) {
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, `failure-${test.info().title.includes("cancels") ? "cancel" : "approval"}.png`), fullPage: true });
    throw error;
  } finally { await preview.close(); }
});

test("canonical runtime renders reasoning and resumes a tool approval once", async ({ page }) => {
  const preview = await createConnectionHostFixture();
  const errors: string[] = [];
  await captureWindowErrors(page, errors);
  const runs: Record<string, any>[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /React does not recognize/.test(message.text())) errors.push(message.text()); });
  page.on("request", request => {
    if (request.method() === "POST" && request.url().startsWith(`${preview.hostOrigin}__agent-ui/mock`)) runs.push(request.postDataJSON());
  });
  try {
    await page.route(`${preview.creatorOrigin}__agent-ui/creator/workspace`, route => route.fulfill({ json: {
      status: "ready", workspace: { id: preview.workspaceId, name: "Runtime acceptance", displayPath: preview.hostRoot },
      project: { mode: "platform", sourceRoot: "src/agent-ui" }, runtime: { status: "ready" },
    } }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(preview.creatorOrigin);
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "连接 Agent", exact: true }).click();
    await page.getByRole("button", { name: "使用示例 Agent", exact: true }).click();
    await page.getByRole("button", { name: "返回对话", exact: true }).click();
    const host = page.frameLocator('iframe[title="Host Application"]');
    expect((await page.request.post(`${preview.creatorOrigin}__agent-ui/creator/mock/select`, { data: { scenarioId: "approval-resume", speed: 0 } })).ok()).toBe(true);
    await host.locator(".aui-composer-root").getByRole("textbox").fill("Test approval");
    await host.locator(".aui-composer-send").click();
    await host.getByRole("button", { name: /思考/ }).click();
    await expect(host.locator('[data-ui-plugin="conversation-surface"]')).toContainText("这个操作会修改工作区");
    await host.getByRole("button", { name: /1 次工具调用/ }).click();
    await expect(host.getByRole("button", { name: "允许", exact: true })).toBeVisible();
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, "tool-approval.png"), fullPage: true });
    await host.getByRole("button", { name: "允许", exact: true }).click();
    await expect(host.locator('[data-ui-plugin="conversation-surface"]')).toContainText("已获得许可，临时构建产物已清理。");
    await expect(host.getByRole("button", { name: "允许", exact: true })).toHaveCount(0);
    expect(runs).toHaveLength(2);
    expect(runs[1]!.threadId).toBe(runs[0]!.threadId);
    expect(runs[1]!.resume).toEqual([{ interruptId: "approval-resume-1", status: "resolved", payload: { approved: true } }]);
    await page.screenshot({ path: path.join(evidence, "approval-completed.png"), fullPage: true });
    expect(errors).toEqual([]);
  } catch (error) {
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, `failure-${test.info().title.includes("cancels") ? "cancel" : "approval"}.png`), fullPage: true });
    throw error;
  } finally { await preview.close(); }
});

test("public Generative UI facade renders a tool card and continues once", async ({ page }) => {
  const preview = await createConnectionHostFixture({ extraOptimizeDeps: ["@za38.03/agent-ui-plugins/generative-ui"] });
  const errors: string[] = [];
  await captureWindowErrors(page, errors);
  const runs: Record<string, any>[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /React does not recognize/.test(message.text())) errors.push(message.text()); });
  try {
    await writeFile(path.join(preview.hostRoot, "src/main.tsx"), 'import { createRoot } from "react-dom/client"; import { Agent } from "./agent-ui"; import { createConversationToolkit } from "@za38.03/agent-ui-plugins"; import { createAgentUIGenerativeUI } from "@za38.03/agent-ui-plugins/generative-ui"; import "./host.css"; import "@za38.03/agent-ui-plugins/generative-ui.css"; const toolkit=createConversationToolkit({present:createAgentUIGenerativeUI().present({display:"standalone"})}); createRoot(document.getElementById("root")!).render(<Agent toolkit={toolkit} endpoint="/generative-acceptance" />);');
    await page.route(`${preview.hostOrigin}generative-acceptance`, async route => {
      const input = route.request().postDataJSON(); runs.push(input);
      const identity = { threadId: input.threadId, runId: input.runId };
      const events = runs.length === 1 ? [
        { type: "RUN_STARTED", ...identity },
        { type: "TOOL_CALL_START", toolCallId: "card1", toolCallName: "present", parentMessageId: "a1" },
        { type: "TOOL_CALL_ARGS", toolCallId: "card1", delta: JSON.stringify({ _type: "Card", title: "Generative UI acceptance", children: [{ _type: "Markdown", value: "**AG-UI 1.0** card rendered through the public facade." }] }) },
        { type: "TOOL_CALL_END", toolCallId: "card1" },
        { type: "RUN_FINISHED", ...identity, outcome: { type: "success", pendingToolCallIds: ["card1"] } },
      ] : [
        { type: "RUN_STARTED", ...identity },
        { type: "TEXT_MESSAGE_START", messageId: "a2", role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: "a2", delta: "Card completed" },
        { type: "TEXT_MESSAGE_END", messageId: "a2" },
        { type: "RUN_FINISHED", ...identity, outcome: { type: "success" } },
      ];
      await route.fulfill({ contentType: "text/event-stream", body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") });
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(preview.hostOrigin);
    await page.locator(".aui-composer-root").getByRole("textbox").fill("Show a card");
    await page.locator(".aui-composer-send").click();
    await expect(page.getByText("Generative UI acceptance", { exact: true })).toBeVisible();
    await expect(page.locator('[data-aui="markdown"] strong')).toHaveText("AG-UI 1.0");
    await expect(page.getByText("Card completed", { exact: true })).toBeVisible();
    expect(runs).toHaveLength(2);
    expect(runs[1]!.messages.filter((message: { role: string }) => message.role === "tool")).toHaveLength(1);
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, "generative-ui-card.png"), fullPage: true });
    expect(errors).toEqual([]);
  } catch (error) {
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, "failure-generative.png"), fullPage: true });
    throw error;
  } finally { await preview.close(); }
});
