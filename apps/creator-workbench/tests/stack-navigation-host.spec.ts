import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { planAgentUIPluginRegistry, synchronizeAgentUIPluginRegistry } from '@za38.03/agent-ui-creator/project/dev';
import { createConnectionHostFixture } from './support/agent-connection-host.js';

async function addIndependentView(hostRoot: string) {
  const source = path.join(hostRoot, 'src/agent-ui');
  const directory = path.join(source, 'plugins/test-feature');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({
    id: 'test-feature', name: 'Test feature', description: 'Disposable independent feature view', version: '0.0.1',
    capabilities: ['test-feature'],
  }));
  await writeFile(path.join(directory, 'index.tsx'), `
import {STACK_NAVIGATION_SERVICE,usePluginService,useLocale,type StackNavigationService} from '@za38.03/agent-ui-plugins';
export function TestFeature() {
  const service=usePluginService<StackNavigationService>(STACK_NAVIGATION_SERVICE);
  const messages=useLocale('navigationMenu');
  return <section data-testid="independent-feature"><p>{messages.label}</p><input aria-label={messages.label}/>
    <button onClick={()=>service?.selectView('main','chat')}>{messages.chat}</button></section>;
}
`);
  await writeFile(path.join(directory, 'definition.ts'), `
import {parseUIPluginManifest,type UIPluginDefinition} from '@za38.03/agent-ui-plugins/contracts';
import manifest from './manifest.json';import {TestFeature} from './index';
const definition:UIPluginDefinition={manifest:parseUIPluginManifest(manifest),inject:['agent-ui.stack-navigation'],Component:TestFeature};
export default definition;
`);
  const applicationSource = await readFile(new URL('../../../packages/plugins/src/plugins/navigation-menu/adapters/application.tsx', import.meta.url), 'utf8');
  const customized = applicationSource.replace(/items=\{props\.items \?\? \(defaults => \[[\s\S]*?\]\)\}/u, `items={props.items ?? (defaults => [
    ...defaults,
    {id:'chat',type:'view',viewId:'chat',label:messages.chat,icon:<MessagesSquareIcon/>},
    {id:'feature',type:'view',viewId:'feature',label:messages.label,icon:<FolderKanbanIcon/>},
  ])}`);
  if (customized === applicationSource) throw new Error('Menu fixture customization failed');
  await writeFile(path.join(source, 'plugins/navigation-menu/index.tsx'), "import {MessagesSquareIcon} from 'lucide-react';\n" + customized);
  const modelPath = path.join(source, 'app-ui.json');
  const model: unknown = JSON.parse(await readFile(modelPath, 'utf8'), (_key: string, value: unknown): unknown => {
    if (value && typeof value === 'object' && 'type' in value && value.type === 'stack' &&
      'id' in value && value.id === 'main' && 'viewIds' in value && Array.isArray(value.viewIds) &&
      'children' in value && Array.isArray(value.children)) {
      const children: unknown[] = value.children;
      const viewIds: unknown[] = value.viewIds;
      return { ...value, viewIds: [...viewIds, 'feature'],
        children: [...children, { type: 'slot', plugins: [{ pluginId: 'test-feature' }] }] };
    }
    return value;
  });
  await writeFile(modelPath, JSON.stringify(model, null, 2));
  await planAgentUIPluginRegistry(hostRoot, JSON.stringify(model));
  await synchronizeAgentUIPluginRegistry(hostRoot);
}

test('project workspace placeholder switches through the default menu and preserves the current chat', async ({ page }, testInfo) => {
  const fixture = await createConnectionHostFixture({ mode: 'platform' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await fixture.writeHostEntry(`import {createRoot} from 'react-dom/client';import {Agent} from './agent-ui';import './host.css';createRoot(document.getElementById('root')!).render(<Agent endpoint=${JSON.stringify(fixture.agentEndpoint)}/>);`);
    fixture.enableCors();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(fixture.hostOrigin);
    const menu = page.locator('[data-ui-plugin="navigation-menu"]');
    const stack = page.locator('[data-stack-navigation-id="main"]');
    const composer = page.locator('[data-ui-plugin="composer"]').getByRole('textbox');
    const conversation = page.locator('[data-ui-plugin="conversation-surface"]');
    await expect(menu.getByRole('button', { name: '聊天', exact: true })).toHaveCount(0);
    await expect(menu.getByRole('button', { name: '知识库', exact: true })).toBeDisabled();
    await expect(menu.getByRole('button', { name: '工作流', exact: true })).toBeDisabled();
    await composer.fill('项目空间演示');
    await page.locator('.aui-composer-send').click();
    await expect(conversation).toContainText('wire:first');
    await composer.fill('保留在当前会话的草稿');
    const conversationNode = await conversation.elementHandle();
    await menu.getByRole('button', { name: '项目空间', exact: true }).click();
    await expect(stack).toHaveAttribute('data-active-view', 'projects');
    await expect(conversation).toBeHidden();
    expect(fixture.pendingCount()).toBe(1);
    const workspace = page.locator('[data-ui-plugin="project-workspace"]');
    await expect(workspace.getByRole('heading', { name: '项目空间', exact: true })).toBeVisible();
    await expect(workspace).toContainText('此为项目空间插件示意占位，真实业务界面需自行开发');
    expect(await workspace.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    fixture.finishRun();
    await expect.poll(() => fixture.pendingCount()).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('workspace-placeholder.png'), fullPage: true });
    await workspace.getByRole('button', { name: '返回当前会话', exact: true }).click();
    await expect(stack).toHaveAttribute('data-active-view', 'chat');
    await expect(composer).toHaveValue('保留在当前会话的草稿');
    await expect(conversation).toContainText('wire:finished');
    expect(await conversationNode!.evaluate(element => element.isConnected)).toBe(true);
    await menu.getByRole('button', { name: '收起侧栏', exact: true }).click();
    await menu.getByRole('button', { name: '项目空间', exact: true }).click();
    await expect(workspace).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('workspace-collapsed-menu.png'), fullPage: true });
    await menu.getByRole('button', { name: '新建会话', exact: true }).click();
    await expect(stack).toHaveAttribute('data-active-view', 'chat');
    await expect(composer).toHaveValue('');
    await menu.getByRole('button', { name: '项目空间', exact: true }).click();
    await page.setViewportSize({ width: 760, height: 900 });
    expect(await workspace.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(fixture.runCount()).toBe(1);
    expect(errors).toEqual([]);
  } finally { if (fixture.pendingCount() > 0) fixture.finishRun(); await fixture.close(); }
});

test('independent view Plugins preserve chat identity, drafts and an AG-UI stream while hidden', async ({ page }, testInfo) => {
  const fixture = await createConnectionHostFixture({ mode: 'platform' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await addIndependentView(fixture.hostRoot);
    await fixture.writeHostEntry(`import {createRoot} from 'react-dom/client';import {Agent} from './agent-ui';import './host.css';createRoot(document.getElementById('root')!).render(<Agent endpoint=${JSON.stringify(fixture.agentEndpoint)}/>);`);
    fixture.enableCors();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(fixture.hostOrigin);
    const menu = page.locator('[data-ui-plugin="navigation-menu"]');
    const stack = page.locator('[data-layout-type="stack"][data-stack-navigation-id="main"]');
    const conversation = page.locator('[data-ui-plugin="conversation-surface"]');
    const composer = page.locator('[data-ui-plugin="composer"]').getByRole('textbox');
    await expect(composer).toBeEditable();
    await composer.fill('keep running while hidden');
    await page.locator('.aui-composer-send').click();
    await expect(conversation).toContainText('wire:first');
    await composer.fill('未发送的草稿');
    const conversationNode = await conversation.elementHandle();
    const composerNode = await composer.elementHandle();
    const featureIcon = await menu.getByRole('button', { name: '功能菜单', exact: true }).locator('svg').elementHandle();
    await menu.getByRole('button', { name: '收起侧栏', exact: true }).click();
    await expect.poll(async () => Math.round((await menu.boundingBox())!.width)).toBe(48);
    await expect(menu.getByRole('button', { name: '功能菜单', exact: true }).locator('svg')).toBeVisible();
    expect(await featureIcon!.evaluate(element => element.isConnected)).toBe(true);
    await menu.getByRole('button', { name: '功能菜单', exact: true }).click();
    await expect(stack).toHaveAttribute('data-active-view', 'feature');
    await expect(conversation).toBeHidden();
    expect(fixture.pendingCount()).toBe(1);
    const feature = page.getByTestId('independent-feature');
    await feature.getByRole('textbox').fill('feature draft');
    await page.screenshot({ path: testInfo.outputPath('feature-view.png'), fullPage: true });
    fixture.finishRun();
    await expect.poll(() => fixture.pendingCount()).toBe(0);
    await feature.getByRole('button', { name: '聊天', exact: true }).click();
    await expect(conversation).toBeVisible();
    await expect(conversation).toContainText('wire:finished');
    await expect(composer).toHaveValue('未发送的草稿');
    expect(await conversationNode!.evaluate(element => element.isConnected && element === document.querySelector('[data-ui-plugin="conversation-surface"]'))).toBe(true);
    expect(await composerNode!.evaluate(element => element.isConnected)).toBe(true);
    await menu.getByRole('button', { name: '功能菜单', exact: true }).click();
    await expect(feature.getByRole('textbox')).toHaveValue('feature draft');
    // The default menu action creates a thread and returns to the chat view.
    await menu.getByRole('button', { name: '新建会话', exact: true }).click();
    await expect(stack).toHaveAttribute('data-active-view', 'chat');
    await expect(composer).toBeEditable();
    await expect.poll(async () => Math.round((await menu.boundingBox())!.width)).toBe(48);
    await menu.getByRole('button', { name: '展开侧栏', exact: true }).click();
    await expect.poll(async () => Math.round((await menu.boundingBox())!.width)).toBe(280);
    await menu.getByRole('button', { name: '功能菜单', exact: true }).click();
    await page.locator('[data-slot="aui_thread-list-item-trigger"]').filter({ hasText: 'keep running while hidden' }).click();
    await expect(stack).toHaveAttribute('data-active-view', 'chat');
    await expect(conversation).toContainText('wire:finished');
    expect(fixture.runCount()).toBe(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('chat-view.png'), fullPage: true });
  } finally { if (fixture.pendingCount() > 0) fixture.finishRun(); await fixture.close(); }
});

test('Platform menu reuses shadcn Sidebar and keeps original icons when collapsed', async ({ page }, testInfo) => {
  const fixture = await createConnectionHostFixture({ mode: 'platform' });
  try {
    await fixture.writeHostEntry(`import {createRoot} from 'react-dom/client';import {Agent} from './agent-ui';import './host.css';createRoot(document.getElementById('root')!).render(<Agent endpoint=${JSON.stringify(fixture.agentEndpoint)}/>);`);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(fixture.hostOrigin);
    const menu = page.locator('[data-ui-plugin="navigation-menu"]');
    const buttons = menu.locator('[data-sidebar="menu-button"]');
    await expect(buttons).toHaveCount(4);
    await expect(buttons).toHaveText(['新建会话', '项目空间', '知识库', '工作流']);
    await expect(menu.getByRole('button', { name: '聊天', exact: true })).toHaveCount(0);
    const icons = await buttons.locator('svg').elementHandles();
    const history = page.locator('[data-ui-plugin="conversation-thread-list"]');
    const historyNode = await history.elementHandle();
    const search = history.locator('[data-slot="aui_thread-list-search"] input');
    const row = history.locator('[data-slot="aui_thread-list-item"]').first();
    await expect(row).toBeVisible();
    const buttonBox = (await buttons.first().boundingBox())!;
    for (const region of [search, row]) {
      const box = (await region.boundingBox())!;
      expect(box.x).toBeCloseTo(buttonBox.x, 1);
      expect(box.width).toBeCloseTo(buttonBox.width, 1);
    }
    const avatarBox = (await menu.locator('.agent-identity-logo').boundingBox())!;
    const menuIconBox = (await buttons.first().locator('.navigation-menu-icon').boundingBox())!;
    expect(avatarBox.x + avatarBox.width / 2).toBeCloseTo(menuIconBox.x + menuIconBox.width / 2, 1);
    const composer = page.locator('[data-ui-plugin="composer"]').getByRole('textbox');
    await composer.fill('继续分析当前项目');
    const composerNode = await composer.elementHandle();
    const beforeWidth = (await page.locator('[data-layout-type="stack"]').first().boundingBox())!.width;
    await page.screenshot({ path: testInfo.outputPath('sidebar-expanded.png'), fullPage: true });
    await menu.getByRole('button', { name: '收起侧栏', exact: true }).click();
    await expect.poll(async () => Math.round((await menu.boundingBox())!.width)).toBe(48);
    const collapsedBox = (await menu.boundingBox())!;
    const triggerBox = (await menu.getByRole('button', { name: '展开侧栏', exact: true }).boundingBox())!;
    expect(triggerBox.x + triggerBox.width / 2).toBeCloseTo(collapsedBox.x + collapsedBox.width / 2, 1);
    for (const icon of icons) expect(await icon.evaluate(element => element instanceof Element && element.isConnected && element.getBoundingClientRect().width === 16)).toBe(true);
    await expect(history).toBeHidden();
    expect(await historyNode!.evaluate(element => element.isConnected)).toBe(true);
    expect((await page.locator('[data-layout-type="stack"]').first().boundingBox())!.width).toBeGreaterThan(beforeWidth);
    await expect(composer).toHaveValue('继续分析当前项目');
    await page.screenshot({ path: testInfo.outputPath('sidebar-collapsed.png'), fullPage: true });
    await menu.getByRole('button', { name: '新建会话', exact: true }).hover();
    const tooltip = page.locator('[data-slot="tooltip-content"]').filter({ hasText: '新建会话' });
    await expect(tooltip).toBeVisible();
    await menu.getByRole('button', { name: '展开侧栏', exact: true }).click();
    await expect(history).toBeVisible();
    expect(await composerNode!.evaluate(element => element.isConnected)).toBe(true);
    // The shared desktop primitives also work inside a container below md width.
    await page.setViewportSize({ width: 760, height: 900 });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', { name: '新建会话', exact: true })).toBeVisible();
  } finally { if (fixture.pendingCount() > 0) fixture.finishRun(); await fixture.close(); }
});

for (const mode of ['assistant', 'embedded'] as const) {
  test(mode + ' header menu creates a conversation while preserving the existing history popover and background thread', async ({ page }, testInfo) => {
    const fixture = await createConnectionHostFixture({ mode });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      page.setDefaultTimeout(15_000);
      await fixture.writeHostEntry(`import {createRoot} from 'react-dom/client';import {Agent} from './agent-ui';import './host.css';createRoot(document.getElementById('root')!).render(<Agent endpoint=${JSON.stringify(fixture.agentEndpoint)}/>);`);
      fixture.enableCors();
      await page.setViewportSize({ width: 1100, height: 900 });
      await page.goto(fixture.hostOrigin);
      // The fixture's development-only Creator launcher overlaps the embedded
      // header. Exercise the independent production UI without that tool overlay.
      await page.addStyleTag({ content: '#agent-ui-creator-dock { display: none; }' });
      if (mode === 'assistant') await page.getByRole('button', { name: '打开助手', exact: true }).click();
      const menu = page.locator('[data-ui-plugin="navigation-menu"]');
      await expect(menu).toHaveAttribute('data-presentation', 'toolbar');
      const create = menu.getByRole('button', { name: '新建会话', exact: true });
      await expect(create.locator('.navigation-menu-label')).toHaveCount(0);
      await expect(create.locator('svg')).toBeVisible();
      const history = page.locator('.conversation-thread-list-popover-trigger');
      await expect(history).toBeVisible();
      const composer = page.locator('[data-ui-plugin="composer"]').getByRole('textbox');
      await composer.fill('保留后台会话');
      await page.locator('.aui-composer-send').click();
      await expect(page.locator('[data-ui-plugin="conversation-surface"]')).toContainText('wire:first');
      await composer.fill('原会话草稿');
      await create.click();
      await expect(composer).toHaveValue('');
      expect(fixture.pendingCount()).toBe(1);
      fixture.finishRun();
      await expect.poll(() => fixture.pendingCount()).toBe(0);
      await history.click();
      await expect(page.locator('.conversation-thread-list-popover')).toBeVisible();
      await page.locator('[data-slot="aui_thread-list-item-trigger"]').filter({ hasText: '保留后台会话' }).click();
      await expect(page.locator('[data-ui-plugin="conversation-surface"]')).toContainText('wire:finished');
      await expect(composer).toHaveValue('原会话草稿');
      await expect(history).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('.conversation-thread-list-popover')).toBeHidden();
      expect(fixture.runCount()).toBe(1);
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(mode + '-menu.png'), fullPage: true });
    } catch (error) {
      console.error(mode + ' menu scenario failed', error);
      await page.screenshot({ path: testInfo.outputPath(mode + '-failure.png'), fullPage: true });
      throw error;
    } finally { if (fixture.pendingCount() > 0) fixture.finishRun(); await fixture.close(); }
  });
}
