import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import { createServer } from "vite";
import { createMockConversationApiVitePlugin } from "@za38.03/agent-ui-creator/mock-agent";
import { installOfficialAgentUIResource } from "@za38.03/agent-ui-creator/project/resources";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";

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

test("Vue consumes standalone composition: streaming, tool result, quote, default controls and portals", async ({ page }) => {
  const { ui, errors } = await connect(page);
  const requests: unknown[] = [];
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/agent?")) requests.push(request.postDataJSON()); });
  await ui.getByRole("textbox").fill("检查项目");
  await ui.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(ui.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
  await expect(ui.locator(".aui-md").last()).toContainText("检查完成", { timeout: 20_000 });
  await expect(ui.getByRole("button", { name: "发送消息", exact: true })).toBeVisible();
  // The default producer has no example toolkit: inspect the canonical group
  // and fallback rather than relying on an opt-in search tool renderer.
  await ui.getByRole("button", { name: "1 次工具调用", exact: true }).click();
  await ui.locator('[data-slot="tool-fallback-trigger"]').click();
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
  await ui.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(ui.getByRole("button", { name: "发送消息", exact: true })).toBeVisible({ timeout: 20_000 });
  expect(JSON.stringify(requests[1])).toContain("检查完成");
  await ui.getByRole("button", { name: "更多操作", exact: true }).last().click();
  await expect(ui.getByRole("menu")).toBeVisible();
  expect(await ui.getByRole("menu").evaluate(element => !!element.closest("[data-agent-ui-portal-root]"))).toBe(true);
  expect(await page.locator('body > [data-base-ui-portal]').count()).toBe(0);
  await page.keyboard.press("Escape");
  const before = await page.locator(".controls code").textContent();
  await ui.getByRole("textbox").fill("/");
  // Slash commands are optional. The default producer keeps them disabled;
  // its canonical new-thread action still creates and selects a fresh thread.
  await expect(ui.getByRole("listbox")).toHaveCount(0);
  await ui.getByRole("button", { name: "新建会话", exact: true }).click();
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
    const composer = document.querySelector("agent-ui")!.shadowRoot!.querySelector('textarea, [contenteditable="true"][role="textbox"]')!;
    return { hostBorder: getComputedStyle(host).borderTopWidth, insideBorder: getComputedStyle(inside).borderTopWidth,
      insideBox: getComputedStyle(inside).boxSizing, inputSize: getComputedStyle(composer).fontSize, hostBox: getComputedStyle(host).boxSizing };
  });
  expect(styles.hostBorder).toBe("10px"); expect(styles.hostBox).toBe("content-box");
  expect(styles.insideBorder).not.toBe("10px"); expect(styles.insideBox).toBe("border-box");
  expect(styles.inputSize).not.toBe("40px");
  expect(errors).toEqual([]);
});

test("markdown and attachments use existing Plugins", async ({ page }) => {
  const { ui, errors } = await connect(page, "/agent?scenario=markdown-showcase&speed=0.01");
  const imageChooser = page.waitForEvent("filechooser");
  await ui.getByRole("button", { name: "添加附件", exact: true }).click();
  await (await imageChooser).setFiles({ name: "preview.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a59sAAAAASUVORK5CYII=", "base64") });
  const image = ui.locator(".aui-attachment-preview-trigger");
  await expect(image).toBeVisible();
  // Default pointer click hits the tile's center, formerly covered by remove's pseudo-element.
  await image.click();
  await expect(ui.getByRole("dialog")).toBeVisible();
  await expect(ui.getByRole("dialog").getByRole("img", { name: "预览 preview.png", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ui.getByRole("dialog")).toHaveCount(0);
  await expect(image).toBeVisible();
  await ui.getByRole("button", { name: "移除 preview.png", exact: true }).click();
  await expect(image).toHaveCount(0);
  const chooser = page.waitForEvent("filechooser");
  await ui.getByRole("button", { name: "添加附件", exact: true }).click();
  await (await chooser).setFiles({ name: "bridge.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nAttachment fixture") });
  await expect(ui.getByRole("group", { name: "文档附件 bridge.pdf", exact: true })).toBeVisible();
  await expect(ui.getByRole("button", { name: "移除 bridge.pdf", exact: true })).toBeVisible();
  let sent: any; page.on("request", request => { if (request.method() === "POST" && request.url().includes("/agent?")) sent = request.postDataJSON(); });
  await ui.getByRole("textbox").fill("Markdown");
  await ui.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(ui.getByRole("heading", { name: "一级标题", exact: true })).toBeVisible();
  expect(JSON.stringify(sent)).toContain("bridge.pdf");
  await expect(ui.locator(".aui-md table")).toBeVisible();
  const codeBlocks = ui.locator(".aui-md pre");
  await expect(codeBlocks).toHaveCount(2);
  await expect(codeBlocks.nth(0)).toBeVisible();
  await expect(codeBlocks.nth(1)).toBeVisible();
  await expect(ui.getByRole("button", { name: "发送消息", exact: true })).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("a compiled project producer with its history service loads and switches persisted thread config", async ({ page }) => {
  // This case builds a standalone production producer before opening the page.
  test.setTimeout(180_000);
  const fixture = await createConnectionHostFixture({ mode: "embedded" });
  let consumer: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    const repository = fileURLToPath(new URL("../../../", import.meta.url));
    for (const name of ["vite", "@vitejs/plugin-react", "@za38.03/agent-ui-web-component"]) {
      const target = path.join(fixture.hostRoot, "node_modules", name);
      await mkdir(path.dirname(target), { recursive: true });
      const source = name.startsWith("@za38.03/") ? path.join(repository, "packages/web-component") : fileURLToPath(new URL(`../node_modules/${name}`, import.meta.url));
      await symlink(source, target, process.platform === "win32" ? "junction" : "dir");
    }
    const manifestFile = path.join(fixture.hostRoot, "package.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    const bridge = JSON.parse(await readFile(path.join(repository, "packages/web-component/package.json"), "utf8"));
    manifest.dependencies[bridge.name] = bridge.version;
    for (const name of ["vite", "@vitejs/plugin-react"]) {
      manifest.devDependencies[name] = JSON.parse(await readFile(path.join(fixture.hostRoot, "node_modules", name, "package.json"), "utf8")).version;
    }
    await writeFile(manifestFile, JSON.stringify(manifest));
    try {
      await installOfficialAgentUIResource(fixture.hostRoot, "web-component-bridge", { runPackages: async () => { throw new Error("Prepared fixture dependencies must satisfy installation"); } });
    } catch (error) { throw new Error(JSON.stringify((error as { technicalDetails?: unknown }).technicalDetails), { cause: error }); }
    const config = path.join(fixture.hostRoot, "src/agent-ui/application/AgentUICompatibilityRoot.tsx");
    const source = await readFile(config, "utf8");
    await writeFile(config, 'import { createHttpConversationDataSource, AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE } from "../services/conversations";\nconst history = createHttpConversationDataSource({ endpoint: "/api" });\n' + source.replace('<CompatibilityRoot {...props}', '<CompatibilityRoot {...props} agentProps={{...props.agentProps, services:{...props.agentProps?.services, [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE]:history}}}'));
    // Playwright runs with NODE_ENV=test. Build the delivered producer under
    // its real production environment, independently from the test process.
    await promisify(execFile)(process.execPath, [path.join(fixture.hostRoot, "node_modules/vite/bin/vite.js"), "build", "--config", "src/agent-ui/integrations/web-component-bridge/vite.config.ts"], {
      cwd: fixture.hostRoot, env: { ...process.env, NODE_ENV: "production" }, maxBuffer: 1_048_576,
    });
    expect(await readFile(path.join(fixture.hostRoot, "src/agent-ui/application/AgentUICompatibilityRoot.tsx"), "utf8")).toContain('endpoint: "/api"');
    await writeFile(path.join(fixture.hostRoot, "index.html"), '<style>html,body{height:100%;margin:0}agent-ui{display:block;width:100%;height:100%}</style><agent-ui thread-id="mock-history-tool"></agent-ui><script type="module" src="/dist/agent-ui-web-component/agent-ui.js"></script>');
    consumer = await createServer({ configFile: false, root: fixture.hostRoot, plugins: [createMockConversationApiVitePlugin({ endpoint: "/api" })], server: { host: "127.0.0.1", port: 0, hmr: false }, logLevel: "error" });
    await consumer.listen();
    const origin = consumer.resolvedUrls?.local[0]; if (!origin) throw new Error("History consumer unavailable");
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    let agentRuns = 0; page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/agent") agentRuns++; });
    const requests: string[] = []; page.on("request", request => requests.push(new URL(request.url()).pathname));
    let historyLoaded = false; page.on("response", response => { if (new URL(response.url()).pathname === "/api/conversations/mock-history-tool") historyLoaded = response.ok(); });
    await page.addInitScript(() => {
      (window as any).producerErrors = [];
      document.addEventListener("agent-error", event => (window as any).producerErrors.push((event as CustomEvent).detail.error?.message));
    });
    await page.goto(origin);
    const ui = page.locator("agent-ui");
    try { await expect.poll(() => historyLoaded, { timeout: 10000 }).toBe(true); }
    catch (error) { throw new Error(JSON.stringify({ errors, requests, producer: await page.evaluate(() => ({ registered: !!customElements.get("agent-ui"), errors: (window as any).producerErrors, shadow: document.querySelector("agent-ui")?.shadowRoot?.textContent?.slice(-1000) })) }), { cause: error }); }
    await expect(ui).toContainText("工具");
    await expect(ui.getByRole("textbox")).toBeEnabled();
    await ui.evaluate((element: any) => { element.config = { ...element.config, threadId: "mock-history-basic" }; });
    await expect(ui).toContainText("帮我分析一下 Agent UI 架构。");
    await expect(ui).toContainText("Runtime、Frontend State 和 UI Plugin");
    await expect(ui.getByRole("textbox")).toBeEnabled();
    expect(agentRuns).toBe(0); expect(errors).toEqual([]);
  } finally { await consumer?.close(); await fixture.close(); }
});

test("config and Runtime errors reach the Host; disconnect cancels a run and remount sends once", async ({ page }) => {
  const { ui, errors } = await connect(page);
  await ui.evaluate((element: any) => { element.config = { ...element.config, locale: "bad" }; });
  await expect.poll(() => page.evaluate(() => (window as any).bridgeEvents.some((event: any) => event.type === "agent-error" && event.detail.code === "AGENT_UI_CONFIG_ERROR"))).toBe(true);
  await ui.evaluate((element: any) => { element.config = { ...element.config, locale: "zh-CN", endpoint: "/bridge-error" }; });
  await page.route("**/bridge-error", route => route.fulfill({ status: 500, body: "test runtime failure" }));
  await ui.getByRole("textbox").fill("错误");
  await ui.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).bridgeEvents.some((event: any) => event.type === "agent-error" && event.detail.code === "AGENT_UI_RUNTIME_ERROR"))).toBe(true);
  await ui.evaluate((element: any) => { element.config = { ...element.config, endpoint: "/agent?speed=1" }; });
  let requests = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/agent?")) requests++; });
  await ui.getByRole("textbox").fill("运行中卸载");
  await ui.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(ui.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
  await ui.evaluate((element: any) => { (window as any).removedBridge = element; element.remove(); element.config = { ...element.config, endpoint: "/agent?speed=0.1" }; });
  await expect.poll(() => page.evaluate(() => (window as any).removedBridge.shadowRoot.querySelector(".aui-composer-root") === null)).toBe(true);
  await page.evaluate(() => document.querySelector("main")!.append((window as any).removedBridge));
  await expect(ui.getByRole("textbox")).toBeVisible();
  await ui.getByRole("textbox").fill("重新挂载");
  await ui.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(ui.locator(".aui-md").last()).toContainText("检查完成", { timeout: 20_000 });
  expect(requests).toBe(2);
  // The simulated network failure is captured as agent-error; no JavaScript crashes.
  expect(errors.filter(message => !message.includes("500"))).toEqual([]);
});

for (const width of [1440, 420]) for (const theme of ["light", "dark", "violet"]) {
  test(`style ownership in Shadow DOM: ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { ui, errors } = await connect(page, "/agent?speed=0.05");
    await ui.evaluate((element: any, theme) => { element.config = { ...element.config, theme }; }, theme);
    await expect(ui.locator('[data-agent-ui-root]')).toHaveAttribute('data-theme', theme);
    await ui.getByRole('textbox').fill('检查项目'); await ui.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect(ui.getByRole('button', { name: '发送消息', exact: true })).toBeVisible({ timeout: 20_000 });
    // Exercise the default toolbar Button, whose ownership and focus-ring
    // contract differs from the unstyled disclosure used by a tool group.
    const tool = ui.getByRole('button', { name: '更多操作', exact: true }); await expect(tool).toBeVisible();
    await expect(ui.getByRole('button', { name: '发送消息', exact: true })).toBeVisible();
    await expect(tool).toHaveAttribute('data-agent-ui-owned', '');
    await expect(tool).toHaveCSS('border-top-width', '1px');
    const directory = path.resolve('../../artifacts/function-fixes-20261031/web-component-style'); await mkdir(path.join(directory, 'screenshots'), { recursive: true });
    const record = async () => tool.evaluate(node => { const css = getComputedStyle(node); return { owned: node.hasAttribute('data-agent-ui-owned'), borderWidth: css.borderTopWidth, borderStyle: css.borderTopStyle, outline: css.outline, shadow: css.boxShadow, focusVisible: node.matches(':focus-visible'), ringVariables: Object.fromEntries(['--tw-inset-shadow','--tw-inset-ring-shadow','--tw-ring-offset-shadow','--tw-ring-offset-width','--tw-shadow'].map(key=>[key,css.getPropertyValue(key)])) }; });
    const normal = await record(); await page.screenshot({ path: path.join(directory, 'screenshots', `shadow-${width}-${theme}-default.png`), fullPage: true });
    await tool.click(); await expect(tool).toHaveAttribute('aria-expanded', 'true');
    const clicked = await record(); expect(clicked.focusVisible).toBe(false);
    await page.screenshot({ path: path.join(directory, 'screenshots', `shadow-${width}-${theme}-open.png`), fullPage: true });
    await page.keyboard.press('Escape'); await expect(tool).toHaveAttribute('aria-expanded', 'false');
    await tool.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    const focused = await record(); await writeFile(path.join(directory, `shadow-${width}-${theme}.json`), JSON.stringify({ normal, clicked, focused, errors }, null, 2)); expect(focused.focusVisible).toBe(true); expect(focused.shadow).not.toBe('none');
    await page.screenshot({ path: path.join(directory, 'screenshots', `shadow-${width}-${theme}-focus.png`), fullPage: true });
    await writeFile(path.join(directory, `shadow-${width}-${theme}.json`), JSON.stringify({ normal, clicked, focused, errors }, null, 2)); expect(errors).toEqual([]);
  });
}
