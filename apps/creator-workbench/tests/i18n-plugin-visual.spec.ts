import { expect, test } from "@playwright/test";
import { createI18nPluginHost } from "./support/i18n-plugin-visual-host";
import { readReleasePluginCoverage } from "./support/i18n-plugin-visual-coverage";
let host: Awaited<ReturnType<typeof createI18nPluginHost>>;
test.beforeAll(async () => {
  const { releaseIds, coverage } = await readReleasePluginCoverage();
  expect(Object.keys(coverage).sort()).toEqual(releaseIds);
  host = await createI18nPluginHost(releaseIds);
  expect(host.plugins).toEqual(releaseIds);
});
test.afterAll(async () => { await host?.close(); });
const scenarios = ["simple-chat", "reasoning-tool-success", "tool-error", "tool-long-running", "web-search", "retrieval-chunks", "source-citations", "file-output", "data-message-chart", "agent-status", "agent-plan", "agent-state-sync", "nested-subagent-task-group", "markdown-showcase"];
for (const scenario of ["empty", ...scenarios]) {
  test(`surface evidence: ${scenario}`, async ({ page }, info) => {
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${host.url}?locale=${info.project.metadata.locale}&scenario=${scenario === "empty" ? "simple-chat" : scenario}`);
    const surface = page.locator('[data-ui-plugin="conversation-surface"]');
    await expect(surface).toBeVisible();
    const input = page.locator('[contenteditable="true"]').first();
    await expect(input).toBeVisible();
    if (scenario !== "empty") {
      await input.fill(`Visual fixture: ${scenario}`); await input.press("Enter");
      await expect(page.locator('[data-slot="aui_assistant-message-root"]').first()).toBeVisible();
      if (scenario === "tool-long-running") {
        await expect(page.locator('.aui-composer-cancel')).toBeVisible();
        await page.screenshot({ path: info.outputPath('running.png'), fullPage: true, animations: "disabled" });
      }
      await expect(page.locator('.aui-composer-send')).toBeVisible({ timeout: 30_000 });
      for (const selector of ['[data-slot="tool-group-trigger"]', '[data-slot="reasoning-trigger"]']) {
        const trigger = page.locator(selector).first();
        if (await trigger.isVisible()) {
          await page.screenshot({ path: info.outputPath(selector.includes('reasoning') ? 'reasoning-collapsed.png' : 'tool-collapsed.png'), fullPage: true, animations: "disabled" });
          if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
        }
      }
    }
    const evidence = await page.evaluate(() => ({
      lang: document.querySelector('[data-agent-ui-root]')?.getAttribute("lang"),
      surfaces: [...new Set([...document.querySelectorAll('[data-ui-plugin]')].map(node => node.getAttribute('data-ui-plugin')))],
      slots: [...new Set([...document.querySelectorAll('[data-slot]')].map(node => node.getAttribute('data-slot')))],
      viewport: { width: innerWidth, height: innerHeight },
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      alerts: [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent),
    }));
    await info.attach("surface-evidence", { body: JSON.stringify({ scenario, installed: host.plugins, ...evidence, errors }, null, 2), contentType: "application/json" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`${scenario}.png`), fullPage: true, animations: "disabled" });
    expect(errors).toEqual([]);
    expect(evidence.overflow).toBe(false);
    const box = await surface.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(300);
    if (scenario === "data-message-chart") await expect(page.locator('[data-slot="chart-message"]')).toBeVisible();
  });
}
test("locale switch preserves composer draft and trigger query", async ({ page }, info) => {
  await page.goto(`${host.url}?locale=${info.project.metadata.locale}`);
  const input = page.locator('[contenteditable="true"]').first(); await expect(input).toBeVisible();
  const picker = page.getByTestId("locale");
  await page.evaluate(() => { (window as any).__i18nBaseline = (window as any).__i18nProbe; });
  const opposite = info.project.metadata.locale === "zh-CN" ? "en-US" : "zh-CN";
  for (const draft of ["Draft remains after language change", "@query", "/query"]) {
    await input.fill(draft); const element = await input.elementHandle();
    await picker.selectOption(opposite); await expect(input).toHaveText(draft);
    expect(await element!.evaluate(node => node.isConnected)).toBe(true);
    expect(await page.evaluate(() => { const before = (window as any).__i18nBaseline; const after = (window as any).__i18nProbe; return ["runtime", "binding", "locale", "conversation", "theme"].every(key => before[key] === after[key]); })).toBe(true);
    await page.screenshot({ path: info.outputPath(`switch-${draft.startsWith("@") ? "mention" : draft.startsWith("/") ? "slash" : "draft"}.png`), fullPage: true, animations: "disabled" });
    await picker.selectOption(String(info.project.metadata.locale));
  }
});

test("thread history selection survives locale switch and More stays in theme boundary", async ({ page }, info) => {
  await page.goto(`${host.url}?locale=${info.project.metadata.locale}`);
  await expect(page.locator('[data-ui-plugin="conversation-surface"]')).toBeVisible();
  // Narrow layout collapses history; use the real responsive control when present.
  const sidebar = page.locator('[data-ui-plugin="conversation-thread-list"]');
  if (!(await sidebar.isVisible())) {
    const toggle = page.locator(".app-ui-layout-drawer-controls button");
    await toggle.click();
  }
  const history = sidebar.getByText("历史：基础会话", { exact: true });
  await expect(history).toBeVisible(); await history.click();
  if (info.project.name.endsWith("narrow")) await page.locator(".app-ui-layout-drawer-close").click();
  await expect(page.locator('[data-slot="aui_assistant-message-root"]').first()).toBeVisible();
  const before = await page.locator('[data-agent-ui-preview-root]').getAttribute('data-app-ui-model-hash');
  const message = page.locator('[data-slot="aui_assistant-message-root"]').first();
  const messageHandle = await message.elementHandle();
  await page.getByTestId("locale").selectOption(info.project.metadata.locale === "zh-CN" ? "en-US" : "zh-CN");
  if (info.project.name.endsWith("narrow")) await page.locator(".app-ui-layout-drawer-controls button").click();
  await expect(sidebar.getByText("历史：基础会话", { exact: true })).toBeVisible();
  expect(await page.locator('[data-agent-ui-preview-root]').getAttribute('data-app-ui-model-hash')).toBe(before);
  expect(await messageHandle!.evaluate(node => node.isConnected)).toBe(true);
  await expect(message).toContainText("可以，我们先从 Runtime");
  await sidebar.locator('[data-slot="agent-ui-thread-action-more"]').first().click();
  const menu = page.locator('[data-slot="agent-ui-thread-action-delete"]');
  await expect(menu).toBeVisible(); expect(await menu.evaluate(node => !!node.closest('[data-agent-ui-root] [data-agent-ui-portal-root]'))).toBe(true);
  await page.screenshot({ path: info.outputPath('history-more.png'), fullPage: true, animations: "disabled" });
});

test("theme, command popover and footer overlays", async ({ page }, info) => {
  await page.goto(`${host.url}?locale=${info.project.metadata.locale}`);
  const input = page.locator('[contenteditable="true"]').first(); await expect(input).toBeVisible();
  const theme = page.locator('[data-ui-plugin="theme-switch"] select');
  for (const value of ["dark", "violet", "light"]) {
    await theme.selectOption(value); await expect(page.locator('[data-agent-ui-root]').first()).toHaveAttribute('data-theme', value);
    await page.screenshot({ path: info.outputPath(`theme-${value}.png`), fullPage: true, animations: "disabled" });
  }
  await input.fill("/new");
  const popover = page.locator('[role="listbox"]').first(); await expect(popover).toBeVisible();
  expect(await popover.evaluate(node => !!node.closest('[data-agent-ui-root]'))).toBe(true);
  await page.getByTestId("locale").selectOption(info.project.metadata.locale === "zh-CN" ? "en-US" : "zh-CN");
  await expect(input).toHaveText('/new');
  await page.screenshot({ path: info.outputPath('command-popover.png'), fullPage: true, animations: "disabled" });
  await input.fill('Footer long content and overlay fixture'); await input.press('Enter');
  await expect(page.locator('.aui-composer-send')).toBeVisible({timeout:30_000});
  const footer = page.locator('[data-slot="aui_assistant-response-footer"]'); await expect(footer).toBeVisible();
  await footer.hover(); await page.screenshot({ path: info.outputPath('footer-hover.png'), fullPage: true, animations: "disabled" });
});

test("thread loading and error evidence", async ({ page }, info) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/__agent-ui/mock-data/conversations', async route => { await gate; await route.fulfill({ status: 500, json: { error: "Fixture failure" } }); });
  await page.goto(`${host.url}?locale=${info.project.metadata.locale}`);
  try {
    await expect(page.locator('[data-ui-plugin="conversation-thread-list"]')).toHaveAttribute("data-conversation-list-status", "loading");
    await page.screenshot({ path: info.outputPath('thread-loading.png'), fullPage: true, animations: "disabled" });
  } finally { release(); }
  await expect(page.locator('.conversation-thread-list-error')).toBeAttached();
  await page.screenshot({ path: info.outputPath('thread-error.png'), fullPage: true, animations: "disabled" });
});

test("mention empty popover, attachments, dictation, edit and export menu", async ({ page }, info) => {
  await page.goto(`${host.url}?locale=${info.project.metadata.locale}`);
  const input = page.locator('[contenteditable="true"]').first(); await expect(input).toBeVisible();
  await input.fill('@missing');
  const popover = page.locator('[role="listbox"]').first(); await expect(popover).toBeVisible();
  expect(await popover.evaluate(node => !!node.closest('[data-agent-ui-root]'))).toBe(true);
  await page.screenshot({path:info.outputPath('mention-empty.png'),fullPage:true,animations:"disabled"});
  await input.fill('@fixture'); await expect(popover).toBeVisible();
  await page.screenshot({path:info.outputPath('mention-long.png'),fullPage:true,animations:"disabled"});
  await input.fill('');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', {name:info.project.metadata.locale === 'zh-CN' ? '添加附件' : 'Add Attachment', exact:true}).click();
  await (await chooserPromise).setFiles({name:'long-attachment-name-for-layout-verification.txt',mimeType:'text/plain',buffer:Buffer.from('Fixture attachment')});
  await page.screenshot({path:info.outputPath('attachment.png'),fullPage:true,animations:"disabled"});
  const dictation = page.getByRole('button', {name: info.project.metadata.locale === 'zh-CN' ? '开始语音输入' : 'Start voice input', exact:true});
  await dictation.click();
  await page.screenshot({path:info.outputPath('dictation-running.png'),fullPage:true,animations:"disabled"});
  await page.getByRole('button', {name: info.project.metadata.locale === 'zh-CN' ? '停止语音输入' : 'Stop voice input', exact:true}).click();
  await input.fill('Editable historical user draft'); await input.press('Enter');
  await expect(page.locator('.aui-composer-send')).toBeVisible({timeout:30_000});
  const footer = page.locator('[data-slot="aui_assistant-response-footer"]'); await expect(footer).toBeVisible();
  await footer.hover(); await footer.getByRole('button', {name:info.project.metadata.locale === 'zh-CN' ? '更多' : 'More',exact:true}).click();
  const menu = page.locator('[data-slot="agent-ui-message-action-menu"]'); await expect(menu).toBeVisible();
  expect(await menu.evaluate(node => !!node.closest('[data-agent-ui-root] [data-agent-ui-portal-root]'))).toBe(true);
  const box = await menu.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x+box!.width).toBeLessThanOrEqual(info.project.use.viewport!.width);
  await page.screenshot({path:info.outputPath('export-menu.png'),fullPage:true,animations:"disabled"});
  await page.keyboard.press('Escape');
  await page.locator('[data-slot="aui_user-message-root"]').first().hover();
  await page.locator('.aui-user-action-edit').first().click();
  const edit = page.locator('[data-slot="agent-ui-edit-composer"]'); await expect(edit).toBeVisible();
  await page.screenshot({path:info.outputPath('lexical-edit.png'),fullPage:true,animations:"disabled"});
});

test("compatibility message footer renders canonical actions", async ({page},info) => {
  await host.setLegacyFooter(true);
  try {
    await page.goto(`${host.url}?locale=${info.project.metadata.locale}`);
    const input = page.locator('[contenteditable="true"]').first(); await expect(input).toBeVisible();
    await input.fill('Compatibility footer'); await input.press('Enter');
    await expect(page.locator('.aui-composer-send')).toBeVisible({timeout:30_000});
    await expect(page.locator('[data-slot="aui_assistant-response-footer-plugin"]')).toBeVisible();
    await page.screenshot({path:info.outputPath('legacy-footer.png'),fullPage:true,animations:"disabled"});
  } finally { await host.setLegacyFooter(false); }
});

test("quote selection and preview", async ({page}, info) => {
  await page.goto(`${host.url}?locale=${info.project.metadata.locale}`);
  const input = page.locator('[contenteditable="true"]').first(); await expect(input).toBeVisible();
  await input.fill('Quote fixture'); await input.press('Enter');
  await expect(page.locator('.aui-composer-send')).toBeVisible({timeout:30_000});
  const content = page.locator('[data-slot="aui_assistant-message-content"]').first();
  await content.scrollIntoViewIfNeeded();
  // Chromium performs the selection through native pointer input.
  await content.locator('p').first().click({ clickCount: 3, position: { x: 12, y: 8 } });
  const quote = page.locator('[data-slot="selection-toolbar-quote"]');
  await expect(quote).toBeVisible();
  await expect(quote).toHaveText(info.project.metadata.locale === "zh-CN" ? "引用" : "Quote");
  expect(await quote.evaluate(node => !!node.closest('[data-agent-ui-portal-root]'))).toBe(true);
  const selectedText = await page.evaluate(() => window.getSelection()?.toString().trim() ?? "");
  expect(selectedText.length).toBeGreaterThan(0);
  await info.attach("quote-selection", { body: selectedText, contentType: "text/plain" });
  await page.screenshot({ path: info.outputPath('quote-toolbar.png'), fullPage: true, animations: "disabled" });
  await quote.click();
  const preview = page.locator('[data-slot="composer-quote"]');
  await expect(preview).toBeVisible();
  await expect(preview.locator('[data-slot="composer-quote-text"]')).toHaveText(selectedText);
  await page.screenshot({ path: info.outputPath('quote-preview.png'), fullPage: true, animations: "disabled" });
  const dismissLabel = info.project.metadata.locale === "zh-CN" ? "取消引用" : "Dismiss quote";
  await expect(preview.getByRole('button', { name: dismissLabel, exact: true })).toHaveAttribute('aria-label', dismissLabel);
  await preview.getByRole('button', { name: dismissLabel, exact: true }).click();
  await expect(preview).toHaveCount(0);

});

test("thread list localization", async ({ page }, info) => {
  await page.goto(`${host.url}?locale=${info.project.metadata.locale}`);
  const sidebar = page.locator('[data-ui-plugin="conversation-thread-list"]');
  if (!(await sidebar.isVisible())) await page.locator('.app-ui-layout-drawer-controls button').click();
  await expect(sidebar).toBeVisible();
  const zh = info.project.metadata.locale === "zh-CN";
  const newThread = sidebar.getByRole('button', { name: zh ? '新建会话' : 'New Thread', exact: true });
  await expect(newThread).toHaveText(zh ? '新建会话' : 'New Thread');
  const search = sidebar.locator('input');
  await expect(search).toHaveAttribute('placeholder', zh ? '搜索会话' : 'Search threads');
  await expect(search).toHaveAttribute('aria-label', zh ? '搜索会话' : 'Search threads');
  await page.screenshot({ path: info.outputPath('thread-labels.png'), fullPage: true, animations: "disabled" });
});

test("header stays above first message without horizontal overflow", async ({ page }, info) => {
  await page.goto(`${host.url}?locale=${info.project.metadata.locale}`);
  const input = page.locator('[contenteditable="true"]').first();
  await expect(input).toBeVisible();
  await input.fill('Header geometry fixture');
  await input.press('Enter');
  await expect(page.locator('.aui-composer-send')).toBeVisible({ timeout: 30_000 });
  const firstMessage = page.locator('[data-slot="aui_user-message-root"]').first();
  await expect(firstMessage).toBeVisible();
  if (info.project.name.endsWith('narrow')) {
    const header = await page.locator('[data-conversation-surface-slot="headerActions"]').boundingBox();
    const message = await firstMessage.boundingBox();
    expect(header).not.toBeNull();
    expect(message).not.toBeNull();
    expect(header!.y + header!.height).toBeLessThanOrEqual(message!.y);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('header-geometry.png'), fullPage: true, animations: "disabled" });
});
