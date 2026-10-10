import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, type Locator } from '@playwright/test';
import { createI18nPluginHost } from './support/i18n-plugin-visual-host';
import { readReleasePluginCoverage } from './support/i18n-plugin-visual-coverage';

let host: Awaited<ReturnType<typeof createI18nPluginHost>>;
const output = path.resolve('../../docs/verification/plugin-style-boundary/current/official-details');
test.beforeAll(async () => {
  host = await createI18nPluginHost((await readReleasePluginCoverage()).releaseIds);
  await mkdir(output, { recursive: true });
});
test.afterAll(async () => { await host?.close(); });
const styles = (locator: Locator) => locator.evaluate(node => {
  const css = getComputedStyle(node);
  return Object.fromEntries(['height', 'width', 'font-size', 'line-height', 'padding', 'border-radius', 'color', 'background-color', 'box-shadow', 'outline', 'animation-name', 'animation-duration'].map(key => [key, css.getPropertyValue(key)]));
});

for (const theme of ['light', 'dark']) test(`official computed geometry, animation and Markdown: ${theme}`, async ({ page }, info) => {
  const locale = String(info.project.metadata.locale);
  const prefix = `${info.project.name}-${theme}`;
  const record: Record<string, unknown> = {};
  await host.setMessagePresentation({ timeline: false, thinking: true, reasoning: false });
  await page.goto(`${host.url}?locale=${locale}&scenario=thinking-placeholder&speed=0.5`);
  await page.locator('[data-ui-plugin="theme-switch"] select').selectOption(theme);
  const input = page.locator('[contenteditable=true]').first();
  await expect(input).toBeVisible();
  record.composer = await styles(input);
  record.send = await styles(page.locator('.aui-composer-send'));
  expect(parseFloat((record.composer as Record<string, string>).height!)).toBeGreaterThan(16);
  await input.focus();
  await expect(input).toBeFocused();
  record.composerFocus = await styles(input);
  await input.fill('Thinking visual fixture');
  await input.press('Enter');
  const indicator = page.locator('[data-slot=thinking-indicator]');
  await expect(indicator).toBeVisible();
  record.thinking = await styles(indicator);
  const dot = indicator.locator('[data-slot=agent-ui-thinking-dot]');
  record.dot = await styles(dot);
  expect((record.dot as Record<string, string>)['animation-name']).not.toBe('none');
  expect(parseFloat((record.thinking as Record<string, string>).height!)).toBeGreaterThan(0);
  const animation = await dot.evaluate(async node => {
    const active = node.getAnimations()[0];
    const before = Number(active?.currentTime);
    await new Promise(resolve => setTimeout(resolve, 150));
    return { before, after: Number(active?.currentTime), playState: active?.playState };
  });
  expect(animation.playState).toBe('running');
  expect(animation.after).toBeGreaterThan(animation.before);
  record.animation = animation;
  await page.screenshot({ path: path.join(output, prefix + '-thinking.png'), fullPage: true });
  await expect(page.locator('.aui-composer-send')).toBeVisible({ timeout: 30_000 });
  await expect(indicator).toHaveCount(0);

  await page.goto(`${host.url}?locale=${locale}&scenario=markdown-showcase`);
  await page.locator('[data-ui-plugin="theme-switch"] select').selectOption(theme);
  await input.fill('Markdown visual fixture');
  await input.press('Enter');
  await expect(page.locator('.aui-composer-send')).toBeVisible({ timeout: 30_000 });
  const markdown = page.locator('[data-slot=aui_assistant-message-root]').first();
  for (const selector of ['pre', 'blockquote', 'ul, ol']) {
    const element = markdown.locator(selector).first();
    await expect(element).toBeVisible();
    record[selector] = await styles(element);
  }
  await page.screenshot({ path: path.join(output, prefix + '-markdown.png'), fullPage: true });
  await writeFile(path.join(output, prefix + '.json'), JSON.stringify(record, null, 2));
});
