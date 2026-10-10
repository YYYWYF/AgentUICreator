import { createRequire } from 'node:module';
import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createServer, type ViteDevServer } from "vite";
const syncStoreRoot = path.dirname(path.dirname(createRequire(import.meta.url).resolve('use-sync-external-store/shim', { paths: [path.resolve('../../packages/react/node_modules/@base-ui/react')] })));
const evidence = path.resolve(process.env.STYLE_EVIDENCE || '../../docs/verification/plugin-style-boundary/full-visual');
const phase = process.env.STYLE_PHASE || 'after';
const bFixture = process.env.STYLE_B_FIXTURE || '/tmp/host-ui-p1-20261009/fixtures/B';
let server: ViteDevServer, fixture: string, url: string;
test.beforeAll(async () => {
  await mkdir(path.join(evidence, 'screenshots'), {recursive:true});
  fixture = await mkdtemp(path.resolve('.style-boundary-'));
  await writeFile(path.join(fixture,'index.html'), '<div id="root"></div><script type="module" src="/fixture.tsx"></script>');
  const ds = await readFile(path.join(bFixture.replace(/\/B$/, '/A'), 'src/design-system/system.css'), 'utf8');
  await writeFile(path.join(fixture,'style.css'), `@import "@agent-ui/react/styles.css"; html,body,#root {margin:0;min-height:100%;} .shell{height:520px;} .probes{display:flex;flex-wrap:wrap;gap:12px;padding:12px;${process.env.STYLE_UNCONTROLLED ? '' : 'line-height:normal;'}} ${ds}`);
  const baseline = execFileSync('git', ['show', '7b1d2a6518a024bf5a89840d3f6cb8b1c320d805:packages/react/src/internal/conversation-thread-list-item.tsx'], { encoding: 'utf8' }).replace(/from "(\.[^"]+)"/g, (_, specifier) => `from "${path.resolve('../../packages/react/dist/internal', specifier)}"`);
  await writeFile(path.join(fixture, 'thread-list-before.tsx'), baseline);
  const baselineSidebar = execFileSync('git', ['show', 'ebc827789408dec0a52d3d72c486c3db0250ad31:packages/react/src/internal/sidebar-frame.tsx'], { encoding: 'utf8' }).replace(/from "(\.[^"]+)"/g, (_, specifier) => `from "${path.resolve('../../packages/react/dist/internal', specifier)}"`);
  await writeFile(path.join(fixture, 'sidebar-before.tsx'), baselineSidebar);
  await writeFile(path.join(fixture,'fixture.tsx'), `
    import {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {AssistantRuntimeProvider,ThreadListPrimitive,useLocalRuntime,useRemoteThreadListRuntime} from '@assistant-ui/react';
    import {AgentUIRoot,AgentUISidebarFrame,AgentUILocaleProvider,ConversationThreadListItem,ConversationThreadListRoot,ConversationThreadListSearch,ConversationThreadListNew,ConversationToolCall} from '@agent-ui/react';
    import {AgentUISidebarFrame as BaselineSidebar} from './sidebar-before';
    import {ConversationThreadListItemComposition as BaselineThreadListItem} from './thread-list-before';
    import {ToolCall as BaselineToolCall} from '${path.resolve('../../packages/react/dist/internal/vendor/assistant-ui/components/assistant-ui/elements/tool-call.js')}';
    import {ConfigProvider,Input,Button,Card,Modal,theme as antTheme} from 'antd';
    import './style.css';
    const theme = new URLSearchParams(location.search).get('theme') || 'light';
    let rows=[{remoteId:'first',status:'regular',title:'会话一'},{remoteId:'second',status:'regular',title:'会话二'}];
    const adapter={list:async()=>({threads:rows}),fetch:async id=>rows.find(r=>r.remoteId===id), initialize:async()=>({remoteId:'new'}),rename:async(id,title)=>{rows=rows.map(r=>r.remoteId===id?{...r,title}:r)}, archive:async()=>{},unarchive:async()=>{},delete:async()=>{},generateTitle:async()=>{}};
    function runtimeHook(){return useLocalRuntime({async *run(){}})}
    function Threads(){const [query,setQuery]=useState('');return <ConversationThreadListRoot><ConversationThreadListNew/><ConversationThreadListSearch value={query} onValueChange={setQuery}/><ThreadListPrimitive.Items components={{ThreadListItem:'${phase}'==='before'?BaselineThreadListItem:ConversationThreadListItem}}/></ConversationThreadListRoot>}
    function Tool(){const [open,setOpen]=useState(false);const Component='${phase}'==='before'?BaselineToolCall:ConversationToolCall;return <Component label="已搜索文件" activeLabel="搜索文件" query="AG-UI" request="AG-UI" result="Found files" running={false} open={open} onOpenChange={setOpen}/>}
    function Probes({id}){const [open,setOpen]=useState(false);return <div data-probes={id} className="probes acme-host" data-theme={theme==='dark'?'dark':'light'}><Card data-probe="antd-card"><Input data-probe="antd-input"/><Input data-probe="antd-disabled" disabled/><Button data-probe="antd-button" onClick={()=>setOpen(true)}>Modal</Button></Card><div className="acme-card" data-probe="ds-card"><button className="acme-button" data-probe="ds-button">Button</button><input className="acme-input" data-probe="ds-input"/></div><Modal title="Host modal" open={open} onCancel={()=>setOpen(false)}><Input data-probe="modal-input"/></Modal></div>}
    function Host(){const Frame='${phase}'==='before'?BaselineSidebar:AgentUISidebarFrame;const runtime=useRemoteThreadListRuntime({runtimeHook,adapter});return <ConfigProvider theme={{algorithm:theme==='dark'?antTheme.darkAlgorithm:antTheme.defaultAlgorithm,token:{borderRadius:12,colorPrimary:'#405bce',fontFamily:'Inter,system-ui,sans-serif'}}}><Probes id="outside"/><AssistantRuntimeProvider runtime={runtime}><AgentUILocaleProvider locale="zh-CN"><AgentUIRoot theme={theme}><div className="shell"><Frame defaultActive={innerWidth>648?"history":""} items={[{id:'history',icon:'messages-square',label:'历史',content:<Threads/>}]}><main style={{padding:16}}><Tool/><Probes id="inside"/></main></Frame></div></AgentUIRoot></AgentUILocaleProvider></AssistantRuntimeProvider></ConfigProvider>}
    createRoot(document.getElementById('root')).render(<Host/>);
  `);
  server = await createServer({configFile:false,root:fixture,cacheDir:path.join(fixture,'.vite'),plugins:[react(),tailwindcss()],resolve:{dedupe:['react','react-dom'],alias:{'use-sync-external-store':syncStoreRoot,'zustand':path.resolve('../../packages/react/node_modules/zustand'),'antd':path.join(bFixture,'node_modules/antd'),'lucide-react':path.resolve('../../packages/react/node_modules/lucide-react'),'@agent-ui/react/styles.css':path.resolve('../../packages/react/dist/styles.css'),'@agent-ui/react':path.resolve('../../packages/react/dist/index.js'),'@assistant-ui/react':path.resolve('../../packages/react/node_modules/@assistant-ui/react')}},optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','antd','@assistant-ui/react','lucide-react','@base-ui/react/**','@agent-ui/react','zustand','use-sync-external-store/shim','use-sync-external-store/shim/with-selector']},server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[path.resolve('../..'),'/tmp']}}});
  await server.listen(); url=server.resolvedUrls!.local[0]!;
});
test.afterAll(async()=>{await server?.close();if(fixture)await rm(fixture,{recursive:true,force:true})});
const properties=['border-top-width','border-top-style','border-top-color','outline-width','outline-style','outline-color','box-shadow','background-color','border-radius','padding','height','color','font-size','line-height','box-sizing'];
async function styles(locator:Locator){return locator.evaluate((element,keys)=>({tag:element.tagName,slot:element.getAttribute('data-slot'),owned:element.hasAttribute('data-agent-ui-owned'),active:element.hasAttribute('data-active'),focusVisible:element.matches(':focus-visible'),hover:element.matches(':hover'),state:element.getAttribute('data-state'),css:Object.fromEntries(keys.map(k=>[k,getComputedStyle(element).getPropertyValue(k)]))}),properties)}
async function matched(page:Page,selector:string){const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});const rules=await cdp.send('CSS.getMatchedStylesForNode',{nodeId});await cdp.detach();return (rules.matchedCSSRules ?? []).map(entry=>({origin:entry.rule.origin,selector:entry.rule.selectorList.text,layers:entry.rule.layers,matchingSelectors:entry.matchingSelectors,properties:entry.rule.style.cssProperties.filter(p=>/^(border|outline|box-shadow|background|padding|height|box-sizing)/.test(p.name))})).filter(entry=>entry.properties.length)}
for(const width of [1440,420])for(const theme of ['light','dark','violet'])test(`${phase} ${width} ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:1000});await page.goto(url+'?theme='+theme);
  const prefix=phase+'-'+width+'-'+theme;const states:Record<string,any>={};
  const shot=async(name:string)=>{if(name==='menu')await page.waitForTimeout(250);return page.screenshot({path:path.join(evidence,'screenshots',prefix+'-'+name+'.png'),fullPage:true});};
  const tool=page.locator('[data-slot=tool-call] button').first();await expect(tool).toBeVisible({ timeout: 30_000 });
  states.toolDefault=await styles(tool);states.toolRules=await matched(page,'[data-slot=tool-call] button');await shot('default');
  if(phase==='after')await expect(tool).toHaveCSS('border-top-width','0px');
  await tool.click();await expect(tool).toHaveAttribute('aria-expanded','true');states.toolClick=await styles(tool);await shot('tool-open');await tool.click();await expect(tool).toHaveAttribute('aria-expanded','false');
  await tool.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');states.toolFocus=await styles(tool);if(phase==='after'){expect(states.toolFocus.focusVisible).toBe(true);expect(states.toolFocus.css['box-shadow']).not.toBe('none');}await shot('tool-focus');
  const sidebar=page.locator('.agent-ui-sidebar-container');if(width===420)await page.getByRole('button',{name:'历史',exact:true}).click();
  const trigger=page.locator('[data-slot=aui_thread-list-item-trigger]').first();await expect(trigger).toBeVisible();const row=page.locator('[data-slot=aui_thread-list-item]').first();
  states.rootDefault=await styles(row);states.triggerDefault=await styles(trigger);states.rootRules=await matched(page,'[data-slot=aui_thread-list-item]');states.triggerRules=await matched(page,'[data-slot=aui_thread-list-item-trigger]');await shot('thread-default');
  if(phase==='after')await expect(trigger).toHaveCSS('border-top-width','0px');await expect(row).toHaveCSS('height','32px');
  await trigger.hover();states.hover=await styles(row);await shot('hover');await trigger.click();states.selected=await styles(row);states.clicked=await styles(trigger);expect((states.clicked as any).focusVisible).toBe(false);await shot('selected');
  await trigger.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');states.focus=await styles(trigger);expect((states.focus as any).focusVisible).toBe(true);await shot('focus');
  await row.locator('[data-slot=agent-ui-thread-action-more]').focus();await page.keyboard.press('ArrowDown');await expect(page.locator('[data-slot=agent-ui-thread-action-menu]')).toBeVisible();states.menu=await styles(page.locator('[data-slot=agent-ui-thread-action-menu]'));states.menuBox=await page.locator('[data-slot=agent-ui-thread-action-menu]').boundingBox();await shot('menu');
  await page.locator('[data-slot=agent-ui-thread-action-rename]').click();const rename=page.locator('[data-slot=agent-ui-thread-rename-input]');await expect(rename).toBeFocused();await page.waitForTimeout(300);await expect(rename).toBeFocused();states.rename=await styles(rename);await shot('rename');await rename.fill('重命名会话');await rename.press('Enter');await expect(trigger).toHaveText('重命名会话');
  if(width===420)await page.keyboard.press('Escape');
  const isolation:Record<string,unknown>={};
  for(const probe of ['antd-input','antd-disabled','antd-button','antd-card','ds-input','ds-button','ds-card']){
    const outside=page.locator('[data-probes=outside] [data-probe='+probe+']');const inside=page.locator('[data-probes=inside] [data-probe='+probe+']');
    const baseOut=await styles(outside),baseIn=await styles(inside);const comparable=(css:Record<string,string>)=>Object.fromEntries(Object.entries(css).filter(([key])=>!probe.endsWith('card')||key!=='height'));expect(comparable(baseIn.css),probe).toEqual(comparable(baseOut.css));isolation[probe]={outside:baseOut,inside:baseIn};
    if(probe==='antd-input'){
      expect(baseIn.css['border-radius']).toBe('12px');expect(baseIn.css.height).toBe('32px');expect(baseIn.css.padding).toBe('4px 11px');expect(baseIn.css['border-top-width']).toBe('1px');
      await outside.hover();await page.waitForTimeout(250);const outHover=await styles(outside);await inside.hover();await page.waitForTimeout(250);const inHover=await styles(inside);await expect.poll(async()=>(await styles(inside)).css).toEqual(outHover.css);
      await outside.focus();await page.waitForTimeout(250);const outFocus=await styles(outside);await inside.focus();await page.waitForTimeout(250);const inFocus=await styles(inside);await expect(inside).toBeFocused();await expect.poll(async()=>(await styles(inside)).css).toEqual(outFocus.css);isolation.inputStates={outHover,inHover,outFocus,inFocus};
    }
  }
  for(const region of ['outside','inside']){
    const opener=page.locator('[data-probes='+region+'] [data-probe=antd-button]');await opener.click();const modal=page.getByRole('dialog');await expect(modal).toBeVisible();isolation['modal-'+region]=await styles(page.locator('[data-probe=modal-input]').filter({visible:true}));await modal.getByRole('textbox').focus();await page.keyboard.press('Tab');expect(await modal.evaluate(node=>node.contains(document.activeElement))).toBe(true);await shot('modal-'+region);await page.keyboard.press('Escape');await expect(modal).not.toBeVisible();
  }
  expect((isolation['modal-inside'] as any).css).toEqual((isolation['modal-outside'] as any).css);states.isolation=isolation;
  await shot('isolation');
  await writeFile(path.join(evidence,prefix+'.json'),JSON.stringify(states,null,2));
});

test('records inherited typography separately from direct Reset isolation', async ({ page }) => {
  await page.goto(url + '?theme=light');
  const inside = page.locator('[data-probes=inside] [data-probe=ds-input]');
  const outside = page.locator('[data-probes=outside] [data-probe=ds-input]');
  await expect(inside).toBeVisible();
  const controlled = { outside: await styles(outside), inside: await styles(inside) };
  await page.locator('[data-probes=inside]').evaluate(element => { (element as HTMLElement).style.lineHeight = 'inherit'; });
  const inherited = await styles(inside);
  const ancestry = await inside.evaluate(element => ({
    inputLineHeight: getComputedStyle(element).lineHeight,
    rootLineHeight: getComputedStyle(element.closest('[data-agent-ui-root]')!).lineHeight,
    explicitOwnership: element.hasAttribute('data-agent-ui-owned'),
  }));
  await writeFile(path.join(evidence, 'typography-inheritance.json'), JSON.stringify({ controlled, inherited, ancestry }, null, 2));
  expect(ancestry.explicitOwnership).toBe(false);
});

test('narrow Sidebar menu stays in its local overlay layer', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 1000 }); await page.goto(url + '?theme=violet');
  await page.getByRole('button', { name: '历史', exact: true }).click();
  const more = page.locator('[data-slot=agent-ui-thread-action-more]').first(); await more.focus(); await page.keyboard.press('ArrowDown');
  const menu = page.locator('[data-slot=agent-ui-thread-action-menu]'); await expect(menu).toBeVisible(); await page.waitForTimeout(250);
  const layers = await menu.evaluate(element => ({
    localSidebarPortal: !!element.closest('.agent-ui-sidebar-portal'),
    opacity: getComputedStyle(element).opacity,
    ancestors: [...(function* () { let node: Element | null = element; while (node) { yield node; node = node.parentElement; } })()].map(node => ({ className: node.className, zIndex: getComputedStyle(node).zIndex, position: getComputedStyle(node).position })),
    sidebarPortalZIndex: getComputedStyle(document.querySelector('.agent-ui-sidebar-portal')!).zIndex,
  }));
  await writeFile(path.join(evidence, 'menu-layer-' + phase + '.json'), JSON.stringify(layers, null, 2));
  await page.screenshot({ path: path.join(evidence, 'screenshots', 'menu-layer-' + phase + '.png'), fullPage: true });
  expect(layers.opacity).toBe('1'); expect(layers.localSidebarPortal).toBe(true);
});
