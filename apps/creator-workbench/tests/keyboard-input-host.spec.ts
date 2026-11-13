import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { installOfficialAgentUIResource } from "@za38.03/agent-ui-creator/project/dev";
import { createControlledAgentHost, startRun, finishRun, writeEvent } from "./support/controlled-agent.js";
import { captureWindowErrors } from "./support/window-errors.js";

const composer = (page: Page) => page.locator(".aui-composer-root").getByRole("textbox");
async function watch(page: Page) { const errors: string[] = []; await captureWindowErrors(page, errors); page.on("pageerror", error => errors.push(error.message)); return errors; }
async function settle(page: Page) { await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }
async function text(input: Locator) { return input.evaluate(element => element instanceof HTMLTextAreaElement ? element.value : (element as HTMLElement).innerText); }
async function configure(root: string, lexical: boolean, mode: "enter" | "ctrlEnter" | "none", nativeGuard = false) {
  if (lexical) await installOfficialAgentUIResource(root, "conversation-lexical-input", { runPackages: async () => { throw new Error("Prepared editor dependencies must be reused"); } });
  const id = lexical ? "lexical-composer-input" : "composer", name = lexical ? "ConversationLexicalComposerInput" : "ConversationComposerPlugin";
  const file = path.join(root, "src/agent-ui/plugins", id, "index.tsx"), source = await readFile(file, "utf8");
  const declaration = new RegExp(`export (?:function ${name}\\(|const ${name}\\s*=)`);
  expect(source).toMatch(declaration);
  const extra = nativeGuard ? 'inputProps={{maxLength:12,onKeyDown:event=>{if(event.key==="Enter"&&!event.shiftKey)event.preventDefault();}}}' : "";
  await writeFile(file, source.replace(declaration, match => match.startsWith("export function") ? "function FixtureBaseInput(" : "const FixtureBaseInput =") + `\nexport function ${name}(props:Parameters<typeof FixtureBaseInput>[0]){return <FixtureBaseInput {...props} submitMode=${JSON.stringify(mode)} ${extra}/>;}\n`);
}

for (const lexical of [false, true]) for (const mode of ["enter", "ctrlEnter", "none"] as const) test(`${lexical ? "Lexical" : "textarea"} honors ${mode} keyboard submission without duplicate requests`, async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({ prepareHost: root => configure(root, lexical, mode), run(input, response, index) { startRun(response, input); finishRun(response, input, `Keyboard response ${index}`); } });
  try {
    await page.goto(f.hostOrigin); const input = composer(page); await expect(input).toBeEditable();
    expect(await input.getAttribute("contenteditable")).toBe(lexical ? "true" : null);
    await input.fill("First line"); await input.press(mode === "enter" ? "Shift+Enter" : "Enter"); await input.pressSequentially("Second line");
    await settle(page); expect(f.requests).toHaveLength(0); expect(await text(input)).toContain("First line"); expect(await text(input)).toContain("Second line");
    if (mode === "none") {
      await input.press("Control+Enter"); await input.press("Meta+Enter"); await settle(page); expect(f.requests).toHaveLength(0);
      await page.locator(".aui-composer-send").click();
    } else {
      await input.press(mode === "enter" ? "Enter" : "Control+Enter");
      if (mode === "enter") await input.press("Enter");
    }
    await expect(page.locator(".aui-md").last()).toContainText("Keyboard response 1"); expect(f.requests).toHaveLength(1);
    const sent = String(f.requests[0]!.messages.at(-1)!.content); expect(sent).toContain("First line"); expect(sent).toContain("Second line");
    if (mode === "ctrlEnter") {
      await input.fill("Command key follow-up"); await input.press("Meta+Enter");
      await expect(page.locator(".aui-md").last()).toContainText("Keyboard response 2"); expect(f.requests).toHaveLength(2);
      expect(f.requests[1]!.messages.at(-1)!.content).toBe("Command key follow-up");
    }
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

for (const lexical of [false, true]) test(`${lexical ? "Lexical" : "textarea"} waits for composition completion and ignores legacy IME Enter`, async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({ prepareHost: root => configure(root, lexical, "enter"), run(input, response) { startRun(response, input); finishRun(response, input, "Committed composition once"); } });
  try {
    await page.goto(f.hostOrigin); const input = composer(page); await expect(input).toBeEditable(); await input.focus();
    const client = await page.context().newCDPSession(page);
    await client.send("Input.imeSetComposition", { text: "中文候选", selectionStart: 4, selectionEnd: 4 });
    await input.evaluate(element => {
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, isComposing: true, bubbles: true, cancelable: true }));
    });
    await client.send("Input.insertText", { text: "中文候选输入" });
    await input.evaluate(element => {
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, isComposing: false, bubbles: true, cancelable: true }));
    });
    await settle(page); expect(f.requests).toHaveLength(0); expect(await text(input)).toContain("中文候选输入");
    await input.press("Enter"); await expect(page.locator(".aui-md")).toContainText("Committed composition once");
    expect(f.requests).toHaveLength(1); expect(f.requests[0]!.messages.at(-1)!.content).toBe("中文候选输入");
    await client.detach();
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("textarea honors native maximum length and application keyboard cancellation", async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({ prepareHost: root => configure(root, false, "enter", true), run(input, response) { startRun(response, input); finishRun(response, input, "Button send after native guard"); } });
  try {
    await page.goto(f.hostOrigin); const input = composer(page); await expect(input).toBeEditable();
    await input.pressSequentially("abcdefghijklmnop"); await expect(input).toHaveValue("abcdefghijkl");
    await input.press("Enter"); await settle(page); expect(f.requests).toHaveLength(0); await expect(input).toHaveValue("abcdefghijkl");
    await page.locator(".aui-composer-send").click(); await expect(page.locator(".aui-md")).toContainText("Button send after native guard");
    expect(f.requests).toHaveLength(1); expect(f.requests[0]!.messages.at(-1)!.content).toBe("abcdefghijkl");
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

for (const lexical of [false, true]) test(`${lexical ? "Lexical" : "textarea"} preserves candidate confirmation while waiting for approval`, async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({
    prepareHost: root => configure(root, lexical, "enter"),
    run(input, response) {
      startRun(response, input);
      writeEvent(response, { type: "TOOL_CALL_START", toolCallId: "ime-tool", toolCallName: "confirm" });
      writeEvent(response, { type: "TOOL_CALL_ARGS", toolCallId: "ime-tool", delta: "{}" });
      writeEvent(response, { type: "TOOL_CALL_END", toolCallId: "ime-tool" });
      writeEvent(response, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId,
        outcome: { type: "interrupt", interrupts: [{ id: "ime-approval", reason: "tool_call", toolCallId: "ime-tool", message: "Confirm this action?", responseSchema: { type: "object", properties: { approved: { type: "boolean" } }, required: ["approved"] } }] } });
      response.end();
    },
  });
  const cdp = await page.context().newCDPSession(page);
  try {
    await page.goto(f.hostOrigin); const input = composer(page); await expect(input).toBeEditable();
    await input.fill("Request approval"); await input.press("Enter");
    if (!(await page.getByRole("button", { name: "允许", exact: true }).isVisible())) await page.getByRole("button", { name: "1 次工具调用", exact: true }).click();
    await expect(page.getByRole("button", { name: "允许", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "停止生成", exact: true })).toHaveCount(0);
    await input.focus();
    await cdp.send("Input.imeSetComposition", { text: "等待审批", selectionStart: 4, selectionEnd: 4 });
    await cdp.send("Input.insertText", { text: "等待审批时保留候选" });
    const prevented = await input.evaluate(element => {
      const event = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, isComposing: false, bubbles: true, cancelable: true });
      element.dispatchEvent(event); return event.defaultPrevented;
    });
    await settle(page); expect(prevented).toBe(false); expect(f.requests).toHaveLength(1);
    expect(await text(input)).toBe("等待审批时保留候选");
    await expect(page.locator('[data-slot="transient-message"]')).toHaveCount(0);
    // An explicit send still follows the existing pending-approval policy.
    await input.press("Enter"); await expect(page.locator('[data-slot="transient-message"]')).toHaveCount(1);
    expect(f.requests).toHaveLength(1); expect(await text(input)).toBe("等待审批时保留候选");
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await cdp.detach(); await f.close(); }
});
