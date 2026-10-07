# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: i18n-plugin-visual.spec.ts >> quote selection and preview
- Location: tests/i18n-plugin-visual.spec.ts:173:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-slot="selection-toolbar-quote"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('[data-slot="selection-toolbar-quote"]') with timeout 5000ms
  - waiting for locator('[data-slot="selection-toolbar-quote"]')

```

```yaml
- combobox "Fixture locale":
  - option "zh-CN"
  - option "en-US" [selected]
- main:
  - button "Open panel"
  - region "Theme settings":
    - combobox "Theme settings":
      - option "Light" [selected]
      - option "Dark"
      - option "Violet"
  - text: Quote fixture
  - paragraph: 你好，这是一个纯文本流式回复。
  - button "Copy"
  - button "Refresh"
  - button "Helpful"
  - button "Not helpful"
  - button "More"
  - textbox "Message input":
    - paragraph
  - button "Add Attachment"
  - button "Start voice input": Voice input
  - button "Send message" [disabled]
```

# Test source

```ts
  82  |   const messageHandle = await message.elementHandle();
  83  |   await page.getByTestId("locale").selectOption(info.project.use.locale === "zh-CN" ? "en-US" : "zh-CN");
  84  |   if (info.project.name.endsWith("narrow")) await page.locator(".app-ui-layout-drawer-controls button").click();
  85  |   await expect(sidebar.getByText("历史：基础会话", { exact: true })).toBeVisible();
  86  |   expect(await page.locator('[data-agent-ui-preview-root]').getAttribute('data-app-ui-model-hash')).toBe(before);
  87  |   expect(await messageHandle!.evaluate(node => node.isConnected)).toBe(true);
  88  |   await expect(message).toContainText("可以，我们先从 Runtime");
  89  |   await sidebar.locator('[data-slot="agent-ui-thread-action-more"]').first().click();
  90  |   const menu = page.locator('[data-slot="agent-ui-thread-action-delete"]');
  91  |   await expect(menu).toBeVisible(); expect(await menu.evaluate(node => !!node.closest('[data-agent-ui-root] [data-agent-ui-portal-root]'))).toBe(true);
  92  |   await page.screenshot({ path: info.outputPath('history-more.png'), fullPage: true, animations: "disabled" });
  93  | });
  94  |
  95  | test("theme, command popover and footer overlays", async ({ page }, info) => {
  96  |   await page.goto(`${host.url}?locale=${info.project.use.locale}`);
  97  |   const input = page.locator('[contenteditable="true"]').first(); await expect(input).toBeVisible();
  98  |   const theme = page.locator('[data-ui-plugin="theme-switch"] select');
  99  |   for (const value of ["dark", "violet", "light"]) {
  100 |     await theme.selectOption(value); await expect(page.locator('[data-agent-ui-root]').first()).toHaveAttribute('data-theme', value);
  101 |     await page.screenshot({ path: info.outputPath(`theme-${value}.png`), fullPage: true, animations: "disabled" });
  102 |   }
  103 |   await input.fill("/new");
  104 |   const popover = page.locator('[role="listbox"]').first(); await expect(popover).toBeVisible();
  105 |   expect(await popover.evaluate(node => !!node.closest('[data-agent-ui-root]'))).toBe(true);
  106 |   await page.getByTestId("locale").selectOption(info.project.use.locale === "zh-CN" ? "en-US" : "zh-CN");
  107 |   await expect(input).toHaveText('/new');
  108 |   await page.screenshot({ path: info.outputPath('command-popover.png'), fullPage: true, animations: "disabled" });
  109 |   await input.fill('Footer long content and overlay fixture'); await input.press('Enter');
  110 |   await expect(page.locator('.aui-composer-send')).toBeVisible({timeout:30_000});
  111 |   const footer = page.locator('[data-slot="aui_assistant-response-footer"]'); await expect(footer).toBeVisible();
  112 |   await footer.hover(); await page.screenshot({ path: info.outputPath('footer-hover.png'), fullPage: true, animations: "disabled" });
  113 | });
  114 |
  115 | test("thread loading and error evidence", async ({ page }, info) => {
  116 |   let release!: () => void;
  117 |   const gate = new Promise<void>(resolve => { release = resolve; });
  118 |   await page.route('**/__agent-ui/mock-data/conversations', async route => { await gate; await route.fulfill({ status: 500, json: { error: "Fixture failure" } }); });
  119 |   await page.goto(`${host.url}?locale=${info.project.use.locale}`);
  120 |   try {
  121 |     await expect(page.locator('[data-ui-plugin="conversation-thread-list"]')).toHaveAttribute("data-conversation-list-status", "loading");
  122 |     await page.screenshot({ path: info.outputPath('thread-loading.png'), fullPage: true, animations: "disabled" });
  123 |   } finally { release(); }
  124 |   await expect(page.locator('.conversation-thread-list-error')).toBeAttached();
  125 |   await page.screenshot({ path: info.outputPath('thread-error.png'), fullPage: true, animations: "disabled" });
  126 | });
  127 |
  128 | test("mention empty popover, attachments, dictation, edit and export menu", async ({ page }, info) => {
  129 |   await page.goto(`${host.url}?locale=${info.project.use.locale}`);
  130 |   const input = page.locator('[contenteditable="true"]').first(); await expect(input).toBeVisible();
  131 |   await input.fill('@missing');
  132 |   const popover = page.locator('[role="listbox"]').first(); await expect(popover).toBeVisible();
  133 |   expect(await popover.evaluate(node => !!node.closest('[data-agent-ui-root]'))).toBe(true);
  134 |   await page.screenshot({path:info.outputPath('mention-empty.png'),fullPage:true,animations:"disabled"});
  135 |   await input.fill('@fixture'); await expect(popover).toBeVisible();
  136 |   await page.screenshot({path:info.outputPath('mention-long.png'),fullPage:true,animations:"disabled"});
  137 |   await input.fill('');
  138 |   const chooserPromise = page.waitForEvent('filechooser');
  139 |   await page.getByRole('button', {name:info.project.use.locale === 'zh-CN' ? '添加附件' : 'Add Attachment', exact:true}).click();
  140 |   await (await chooserPromise).setFiles({name:'long-attachment-name-for-layout-verification.txt',mimeType:'text/plain',buffer:Buffer.from('Fixture attachment')});
  141 |   await page.screenshot({path:info.outputPath('attachment.png'),fullPage:true,animations:"disabled"});
  142 |   const dictation = page.getByRole('button', {name: info.project.use.locale === 'zh-CN' ? '开始语音输入' : 'Start voice input', exact:true});
  143 |   await dictation.click();
  144 |   await page.screenshot({path:info.outputPath('dictation-running.png'),fullPage:true,animations:"disabled"});
  145 |   await page.getByRole('button', {name: info.project.use.locale === 'zh-CN' ? '停止语音输入' : 'Stop voice input', exact:true}).click();
  146 |   await input.fill('Editable historical user draft'); await input.press('Enter');
  147 |   await expect(page.locator('.aui-composer-send')).toBeVisible({timeout:30_000});
  148 |   const footer = page.locator('[data-slot="aui_assistant-response-footer"]'); await expect(footer).toBeVisible();
  149 |   await footer.hover(); await footer.getByRole('button', {name:info.project.use.locale === 'zh-CN' ? '更多' : 'More',exact:true}).click();
  150 |   const menu = page.locator('[data-slot="agent-ui-message-action-menu"]'); await expect(menu).toBeVisible();
  151 |   expect(await menu.evaluate(node => !!node.closest('[data-agent-ui-root] [data-agent-ui-portal-root]'))).toBe(true);
  152 |   const box = await menu.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x+box!.width).toBeLessThanOrEqual(info.project.use.viewport!.width);
  153 |   await page.screenshot({path:info.outputPath('export-menu.png'),fullPage:true,animations:"disabled"});
  154 |   await page.keyboard.press('Escape');
  155 |   await page.locator('[data-slot="aui_user-message-root"]').first().hover();
  156 |   await page.locator('.aui-user-action-edit').first().click();
  157 |   const edit = page.locator('[data-slot="agent-ui-edit-composer"]'); await expect(edit).toBeVisible();
  158 |   await page.screenshot({path:info.outputPath('lexical-edit.png'),fullPage:true,animations:"disabled"});
  159 | });
  160 |
  161 | test("compatibility message footer renders canonical actions", async ({page},info) => {
  162 |   await host.setLegacyFooter(true);
  163 |   try {
  164 |     await page.goto(`${host.url}?locale=${info.project.use.locale}`);
  165 |     const input = page.locator('[contenteditable="true"]').first(); await expect(input).toBeVisible();
  166 |     await input.fill('Compatibility footer'); await input.press('Enter');
  167 |     await expect(page.locator('.aui-composer-send')).toBeVisible({timeout:30_000});
  168 |     await expect(page.locator('[data-slot="aui_assistant-response-footer-plugin"]')).toBeVisible();
  169 |     await page.screenshot({path:info.outputPath('legacy-footer.png'),fullPage:true,animations:"disabled"});
  170 |   } finally { await host.setLegacyFooter(false); }
  171 | });
  172 |
  173 | test("quote selection and preview", async ({page}, info) => {
  174 |   await page.goto(`${host.url}?locale=${info.project.use.locale}`);
  175 |   const input = page.locator('[contenteditable="true"]').first(); await expect(input).toBeVisible();
  176 |   await input.fill('Quote fixture'); await input.press('Enter');
  177 |   await expect(page.locator('.aui-composer-send')).toBeVisible({timeout:30_000});
  178 |   const content = page.locator('[data-slot="aui_assistant-message-content"]').first();
  179 |   await content.scrollIntoViewIfNeeded();
  180 |   await content.locator('p').first().dblclick();
  181 |   await info.attach("quote-selection", { body: JSON.stringify(await page.evaluate(() => { const selection = window.getSelection(); const anchor = selection?.anchorNode; const element = anchor instanceof Element ? anchor : anchor?.parentElement; return { text: selection?.toString(), messageId: element?.closest('[data-message-id]')?.getAttribute('data-message-id'), selectable: element?.closest('[data-aui-quote-selectable]')?.getAttribute('data-aui-quote-selectable'), toolbarCount: document.querySelectorAll('[data-slot="selection-toolbar-quote"]').length }; }), null, 2), contentType: "application/json" });
> 182 |   const quote = page.locator('[data-slot="selection-toolbar-quote"]'); await expect(quote).toBeVisible(); await quote.click();
      |                                                                                            ^ Error: expect(locator).toBeVisible() failed
  183 |   await expect(page.locator('[data-slot="composer-quote"]')).toBeVisible();
  184 |   await page.screenshot({path:info.outputPath('quote-preview.png'),fullPage:true,animations:"disabled"});
  185 | });
  186 |
```
