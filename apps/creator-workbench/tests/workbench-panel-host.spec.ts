import { expect, test } from '@playwright/test';
import { createConnectionHostFixture } from './support/agent-connection-host.js';

test('platform panel tabs and external callers preserve content and an in-flight conversation', async ({ page }, testInfo) => {
  const fixture = await createConnectionHostFixture({ mode: 'platform' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Keep the draggable development launcher clear of the product tabs.
    await page.addInitScript(() => localStorage.setItem('agent-ui-creator-dock:left', '460'));
    await fixture.writeHostEntry(`import {createRoot} from 'react-dom/client';import {Agent} from './agent-ui';import './host.css';const value=new URLSearchParams(location.search).get('theme');const theme=value==='light'||value==='dark'?value:'violet';createRoot(document.getElementById('root')!).render(<Agent theme={theme} endpoint=${JSON.stringify(fixture.agentEndpoint)}/>);`);
    fixture.enableCors();
    await page.goto(fixture.hostOrigin);
    const panel = page.locator('[data-ui-plugin="workbench-panel"]');
    const actions = page.locator('[data-ui-plugin="workbench-panel-actions"]');
    const conversation = page.locator('[data-ui-plugin="conversation-surface"]');
    const composer = page.locator('[data-ui-plugin="composer"]').getByRole('textbox');
    await expect(composer).toBeEditable();
    await expect(panel).toHaveAttribute('data-open', 'false');
    const rail = panel.locator('.workbench-panel-rail');
    const restore = panel.getByRole('button', { name: '打开侧栏', exact: true });
    const toggle = panel.locator('.workbench-panel-toggle');
    await expect(restore).toBeVisible();
    const toggleNode = (await toggle.elementHandle())!;
    const toggleBounds = (await toggle.boundingBox())!;
    const leftToggle = page.locator('[data-slot="sidebar-trigger"], .app-ui-layout-drawer-controls button').filter({ visible: true }).first();
    const leftBounds = (await leftToggle.boundingBox())!;
    expect(toggleBounds.width).toBe(leftBounds.width);
    expect(toggleBounds.height).toBe(leftBounds.height);
    expect((await toggle.locator('svg').boundingBox())!.width).toBe((await leftToggle.locator('svg').boundingBox())!.width);
    expect((await rail.boundingBox())!.width).toBe(48);
    const fullWidth = (await conversation.boundingBox())!.width;
    await composer.fill('keep this conversation running');
    await page.locator('.aui-composer-send').click();
    await expect(conversation).toContainText('wire:first');
    const conversationNode = await conversation.elementHandle();
    const composerNode = await composer.elementHandle();
    await composer.fill('未发送的对话草稿');
    await actions.getByRole('button', { name: '笔记', exact: true }).click();
    await expect(panel).toHaveAttribute('data-open', 'true');
    expect(await toggle.boundingBox()).toEqual(toggleBounds);
    const region = panel.locator('.workbench-panel-side');
    const main = panel.locator('.workbench-panel-main');
    const panelBounds = (await panel.boundingBox())!;
    const sideBounds = (await region.boundingBox())!;
    expect(sideBounds.y).toBeCloseTo(panelBounds.y, 0);
    expect(sideBounds.height).toBeCloseTo(panelBounds.height, 0);
    expect(sideBounds.y).toBeCloseTo((await main.boundingBox())!.y, 0);
    expect(panelBounds.y).toBeCloseTo(0, 0);
    await expect(main.locator('[data-ui-plugin="workbench-panel-actions"]')).toBeVisible();
    const notes = panel.getByRole('textbox', { name: '笔记草稿', exact: true });
    await notes.fill('笔记里的草稿');
    await panel.getByRole('tab', { name: '详情', exact: true }).click();
    const details = panel.getByRole('textbox', { name: '详情草稿', exact: true });
    await details.fill('详情里的草稿');
    await panel.getByRole('button', { name: '关闭详情', exact: true }).click();
    await expect(panel.getByRole('tab', { name: '详情', exact: true })).toHaveCount(0);
    await expect(notes).toHaveValue('笔记里的草稿');
    await panel.getByRole('button', { name: '关闭笔记', exact: true }).click();
    await expect(panel).toHaveAttribute('data-open', 'false');
    expect((await conversation.boundingBox())!.width).toBeCloseTo(fullWidth, 0);
    await actions.getByRole('button', { name: '笔记', exact: true }).click();
    await expect(notes).toHaveValue('笔记里的草稿');
    await actions.getByRole('button', { name: '详情', exact: true }).click();
    await expect(details).toHaveValue('详情里的草稿');
    expect(fixture.runCount()).toBe(1);
    expect(fixture.pendingCount()).toBe(1);
    for (let i = 0; i < 4; i++) {
      await panel.getByRole('button', { name: '收起', exact: true }).click();
      await expect(panel).toHaveAttribute('data-open', 'false');
      expect((await conversation.boundingBox())!.width).toBeCloseTo(fullWidth, 0);
      await expect(restore).toBeVisible();
      expect(await toggle.boundingBox()).toEqual(toggleBounds);
      expect((await rail.boundingBox())!.width).toBe(48);
      if (i === 0) await page.screenshot({ path: testInfo.outputPath('panel-collapsed.png'), fullPage: true });
      await restore.click();
      await expect(toggle).toBeFocused();
      expect(await toggle.boundingBox()).toEqual(toggleBounds);
      expect(await toggleNode.evaluate(element => element.isConnected && element === document.querySelector('.workbench-panel-toggle'))).toBe(true);
      const frames = await toggle.evaluate(async element => {
        const samples: { x: number; y: number; width: number; height: number; scrollX: number; scrollY: number }[] = [];
        for (let frame = 0; frame < 8; frame++) {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          const bounds = element.getBoundingClientRect();
          samples.push({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, scrollX, scrollY });
        }
        return samples;
      });
      for (const sample of frames) expect(sample).toEqual({ ...toggleBounds, scrollX: 0, scrollY: 0 });
      await expect(details).toHaveValue('详情里的草稿');
      await panel.getByRole('button', { name: '收起', exact: true }).click();
      await actions.getByRole('button', { name: '笔记', exact: true }).click();
      await expect(notes).toHaveValue('笔记里的草稿');
      await actions.getByRole('button', { name: '详情', exact: true }).click();
      await expect(details).toHaveValue('详情里的草稿');
      await expect(composer).toHaveValue('未发送的对话草稿');
      expect(await conversationNode!.evaluate(element => element.isConnected)).toBe(true);
      expect(await composerNode!.evaluate(element => element.isConnected)).toBe(true);
      expect(fixture.runCount()).toBe(1);
      expect(fixture.pendingCount()).toBe(1);
    }
    await panel.getByRole('tab', { name: '详情', exact: true }).press('ArrowLeft');
    await expect(panel.getByRole('tab', { name: '笔记', exact: true })).toBeFocused();
    await expect(notes).toHaveValue('笔记里的草稿');
    fixture.finishRun();
    await expect(conversation).toContainText('wire:finished');
    await expect(composer).toHaveValue('未发送的对话草稿');
    expect(fixture.runCount()).toBe(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('workbench-panel.png'), fullPage: true });
    for (const theme of ['violet', 'light', 'dark']) {
      await page.goto(`${fixture.hostOrigin}?theme=${theme}`);
      await actions.getByRole('button', { name: '笔记', exact: true }).click();
      await expect(panel.getByRole('tab', { name: '笔记', exact: true })).toHaveAttribute('aria-selected', 'true');
      const selectedConversation = page.locator('[data-slot="aui_thread-list-item"][data-active="true"]').first();
      await expect(selectedConversation).toBeVisible();
      const conversationColor = await selectedConversation.evaluate(element => getComputedStyle(element).backgroundColor);
      expect(await panel.locator('.workbench-panel-header').evaluate(element => getComputedStyle(element).backgroundImage)).toContain(conversationColor);
      const contentColor = await panel.locator('.workbench-panel-side').evaluate(element => getComputedStyle(element).backgroundColor);
      expect(await panel.locator('.workbench-panel-tab[data-active="true"]').evaluate(element => getComputedStyle(element).backgroundColor)).toBe(contentColor);
      await panel.locator('.workbench-panel-header').screenshot({ path: testInfo.outputPath(`panel-tabs-${theme}.png`) });
      await page.screenshot({ path: testInfo.outputPath(`panel-${theme}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});
