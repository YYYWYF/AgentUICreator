import { expect, test, type Page } from "@playwright/test";

async function connect(page: Page, endpoint = "/agent?speed=0.15") {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => {
    (window as any).bridgeEvents = [];
    for (const type of ["agent-ready", "thread-change", "agent-error"]) document.addEventListener(type, event => {
      const custom = event as CustomEvent;
      (window as any).bridgeEvents.push({ type, detail: { ...custom.detail, error: custom.detail.error?.message }, bubbles: custom.bubbles, composed: custom.composed });
    });
  });
  await page.goto("/");
  const ui = page.locator("agent-ui");
  await expect(ui.getByRole("textbox")).toBeVisible();
  await ui.evaluate((element: any, endpoint) => { element.config = { ...element.config, endpoint }; }, endpoint);
  await expect(ui.getByRole("textbox")).toBeVisible();
  return { ui, errors };
}

test("Vue consumes standalone composition: streaming, tool result, quote, slash and portals", async ({ page }) => {
  const { ui, errors } = await connect(page);
  const requests: unknown[] = [];
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/agent?")) requests.push(request.postDataJSON()); });
  await ui.getByRole("textbox").fill("检查项目");
  await ui.getByRole("button", { name: "发送", exact: true }).click();
  await expect(ui.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
  await expect(ui.locator(".aui-md").last()).toContainText("检查完成", { timeout: 20_000 });
  await expect(ui.getByRole("button", { name: "发送", exact: true })).toBeVisible();
  await expect(ui.getByRole("button", { name: /已搜索文件/ })).toBeVisible();
  await ui.getByRole("button", { name: /已搜索文件/ }).click();
  await expect(ui).toContainText("conversation-execution-projector.ts");
  expect(requests).toHaveLength(1);
  await ui.locator(".aui-md p").last().evaluate(element => {
    const selection = window.getSelection()!;
    const range = document.createRange(); range.selectNodeContents(element);
    selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect(ui.locator('[data-slot="selection-toolbar"]')).toBeVisible();
  expect(await ui.locator('[data-slot="selection-toolbar"]').evaluate(element => !!element.closest("[data-agent-ui-portal-root]"))).toBe(true);
  await ui.getByRole("button", { name: "引用", exact: true }).click();
  await expect(ui.locator('[data-slot="composer-quote"]')).toContainText("检查完成");
  await ui.getByRole("textbox").fill("继续");
  await ui.getByRole("button", { name: "发送", exact: true }).click();
  await expect(ui.getByRole("button", { name: "发送", exact: true })).toBeVisible({ timeout: 20_000 });
  expect(JSON.stringify(requests[1])).toContain("检查完成");
  await ui.getByRole("button", { name: "更多", exact: true }).last().click();
  await expect(ui.getByRole("menu")).toBeVisible();
  expect(await ui.getByRole("menu").evaluate(element => !!element.closest("[data-agent-ui-portal-root]"))).toBe(true);
  expect(await page.locator('body > [data-base-ui-portal]').count()).toBe(0);
  await page.keyboard.press("Escape");
  const before = await page.locator(".controls code").textContent();
  await ui.getByRole("textbox").fill("/");
  await expect(ui.getByRole("listbox")).toContainText("新建会话");
  await page.keyboard.press("Enter");
  await expect(page.locator(".controls code")).not.toHaveText(before!);
  await expect(ui.locator(".aui-md")).toHaveCount(0);
  expect(errors).toEqual([]);
  const events = await page.evaluate(() => (window as any).bridgeEvents);
  expect(events.some((event: any) => event.type === "agent-ready")).toBe(true);
  expect(events.filter((event: any) => event.type === "thread-change").every((event: any) => event.bubbles && event.composed)).toBe(true);
});

test("hostile Host CSS is isolated; locale and theme updates retain the draft", async ({ page }) => {
  const { ui, errors } = await connect(page, "/agent");
  await ui.getByRole("textbox").fill("保留草稿");
  await page.getByRole("button", { name: "violet / dark", exact: true }).click();
  await expect(ui.locator("[data-agent-ui-root]")).toHaveAttribute("data-theme", "dark");
  await expect(ui.getByRole("textbox")).toHaveText("保留草稿");
  await page.getByRole("button", { name: "zh-CN / en-US", exact: true }).click();
  await expect(ui.getByRole("textbox")).toHaveAttribute("aria-label", "Message input");
  await expect(ui.getByRole("textbox")).toHaveText("保留草稿");
  const styles = await page.evaluate(() => {
    const host = document.querySelector(".controls button")!;
    const inside = document.querySelector("agent-ui")!.shadowRoot!.querySelector("button")!;
    const composer = document.querySelector("agent-ui")!.shadowRoot!.querySelector('[role="textbox"]')!;
    return { hostBorder: getComputedStyle(host).borderTopWidth, insideBorder: getComputedStyle(inside).borderTopWidth,
      insideBox: getComputedStyle(inside).boxSizing, inputSize: getComputedStyle(composer).fontSize, hostBox: getComputedStyle(host).boxSizing };
  });
  expect(styles.hostBorder).toBe("10px"); expect(styles.hostBox).toBe("content-box");
  expect(styles.insideBorder).not.toBe("10px"); expect(styles.insideBox).toBe("border-box");
  expect(styles.inputSize).not.toBe("40px");
  expect(errors).toEqual([]);
});

test("markdown and attachments use existing Plugins; persisted thread config switches", async ({ page }) => {
  const { ui, errors } = await connect(page, "/agent?scenario=markdown-showcase&speed=0.01");
  const chooser = page.waitForEvent("filechooser");
  await ui.getByRole("button", { name: "添加附件", exact: true }).click();
  await (await chooser).setFiles({ name: "bridge.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nAttachment fixture") });
  await expect(ui.getByRole("button", { name: "文档附件", exact: true })).toBeVisible();
  let sent: any; page.on("request", request => { if (request.method() === "POST" && request.url().includes("/agent?")) sent = request.postDataJSON(); });
  await ui.getByRole("textbox").fill("Markdown");
  await ui.getByRole("button", { name: "发送", exact: true }).click();
  await expect(ui.getByRole("heading", { name: "Heading 1", exact: true })).toBeVisible();
  expect(JSON.stringify(sent)).toContain("bridge.pdf");
  await expect(ui.locator(".aui-md table")).toBeVisible();
  await expect(ui.locator(".aui-md pre")).toBeVisible();
  await expect(ui.getByRole("button", { name: "发送", exact: true })).toBeVisible({ timeout: 20_000 });
  await ui.evaluate((element: any) => { element.config = { ...element.config, threadId: "mock-history-tool" }; });
  await expect(page.locator(".controls code")).toHaveText("mock-history-tool");
  await expect(ui).toContainText("工具");
  expect(errors).toEqual([]);
});

test("config and Runtime errors reach the Host; disconnect cancels a run and remount sends once", async ({ page }) => {
  const { ui, errors } = await connect(page);
  await ui.evaluate((element: any) => { element.config = { ...element.config, locale: "bad" }; });
  await expect.poll(() => page.evaluate(() => (window as any).bridgeEvents.some((event: any) => event.type === "agent-error" && event.detail.code === "AGENT_UI_CONFIG_ERROR"))).toBe(true);
  await ui.evaluate((element: any) => { element.config = { ...element.config, locale: "zh-CN", endpoint: "/bridge-error" }; });
  await page.route("**/bridge-error", route => route.fulfill({ status: 500, body: "test runtime failure" }));
  await ui.getByRole("textbox").fill("错误");
  await ui.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).bridgeEvents.some((event: any) => event.type === "agent-error" && event.detail.code === "AGENT_UI_RUNTIME_ERROR"))).toBe(true);
  await ui.evaluate((element: any) => { element.config = { ...element.config, endpoint: "/agent?speed=1" }; });
  let requests = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/agent?")) requests++; });
  await ui.getByRole("textbox").fill("运行中卸载");
  await ui.getByRole("button", { name: "发送", exact: true }).click();
  await expect(ui.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
  await ui.evaluate((element: any) => { (window as any).removedBridge = element; element.remove(); element.config = { ...element.config, endpoint: "/agent?speed=0.1" }; });
  await expect.poll(() => page.evaluate(() => (window as any).removedBridge.shadowRoot.querySelector("[role=textbox]") === null)).toBe(true);
  await page.evaluate(() => document.querySelector("main")!.append((window as any).removedBridge));
  await expect(ui.getByRole("textbox")).toBeVisible();
  await ui.getByRole("textbox").fill("重新挂载");
  await ui.getByRole("button", { name: "发送", exact: true }).click();
  await expect(ui.locator(".aui-md").last()).toContainText("检查完成", { timeout: 20_000 });
  expect(requests).toBe(2);
  // The simulated network failure is captured as agent-error; no JavaScript crashes.
  expect(errors.filter(message => !message.includes("500"))).toEqual([]);
});
