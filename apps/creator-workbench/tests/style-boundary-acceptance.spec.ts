import { createRequire } from 'node:module';
import {test,expect,type Locator} from '@playwright/test';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {createServer,type ViteDevServer} from 'vite';
const syncStoreRoot = path.dirname(path.dirname(createRequire(import.meta.url).resolve('use-sync-external-store/shim', { paths: [path.resolve('../../packages/react/node_modules/@base-ui/react')] })));
const repo=path.resolve('../..'),out=path.join(repo,'docs/verification/plugin-style-boundary/current');
const b=process.env.STYLE_B_FIXTURE || '/tmp/host-ui-p1-20261009/fixtures/B';
let server:ViteDevServer,fixture:string,url:string;
const keys=['height','width','padding','padding-top','padding-right','padding-bottom','padding-left','border-width','border-radius','border-color','border-style','font-size','font-family','line-height','color','background','background-color','box-shadow','box-sizing'];
const style=(l:Locator)=>l.evaluate((e,keys)=>Object.fromEntries(keys.map(k=>[k,getComputedStyle(e).getPropertyValue(k)])),keys);
const rows:any[]=[];
test.beforeAll(async()=>{
 for(const scene of ['A','B','C'])await mkdir(path.join(out,'visual',scene),{recursive:true});
 fixture=await mkdtemp(path.resolve('.style-final-'));
 await writeFile(path.join(fixture,'index.html'),'<div id="root"></div><script type="module" src="/fixture.tsx"></script>');
 const ds=await readFile(path.join(path.dirname(b),'A/src/design-system/system.css'),'utf8');
 await writeFile(path.join(fixture,'style.css'),`@import "@agent-ui/react/styles.css"; html,body,#root{margin:0;min-height:100%} .probe{width:300px;max-width:100%;box-sizing:border-box} .probe .ant-card{width:268px} .shell{height:600px} ${ds}`);
 await writeFile(path.join(fixture,'fixture.tsx'),`
 import {useState} from 'react';import{createRoot}from'react-dom/client';
 import{AgentUIRoot,AgentUILocaleProvider,AgentUISidebarFrame,AgentUIDialog,AgentUIDialogContent as DialogContent}from'@agent-ui/react';
 const Dialog=AgentUIDialog.Root,DialogTrigger=AgentUIDialog.Trigger,DialogTitle=AgentUIDialog.Title;

 import{ConfigProvider,Input,Button,Card,List,Modal,theme as antTheme}from'antd';import{Input as DSInput,Button as DSButton,Card as DSCard}from'${path.dirname(b)}/A/src/design-system';import'./style.css';
 const params=new URLSearchParams(location.search),scene=params.get('scene')||'B',theme=params.get('theme')||'light',locale=params.get('locale')||'zh-CN';
 const copy=locale==='zh-CN'?{button:'说明',title:'业务说明',close:'关闭',label:'备注',list:'备注内容'}:{button:'Help',title:'Business help',close:'Close',label:'Note',list:'Note content'};
 function Probes({id}){const[open,setOpen]=useState(false);const native=scene==='B';return <section data-probes={id} className={id==='host'?'probe acme-host':'probe acme-host app-ui-plugin-instance'} data-theme={theme==='dark'?'dark':'light'}>{native?<Card data-probe="card" title={copy.label}><Input data-slot="input" data-probe="input" aria-label={copy.label}/><Input data-probe="disabled-input" disabled/><Button data-slot="button" data-probe="button" onClick={()=>setOpen(true)}>{copy.button}</Button><Button data-probe="disabled-button" disabled>{copy.button}</Button><List data-probe="list" dataSource={[copy.list]} renderItem={item=><List.Item>{item}</List.Item>}/></Card>:<DSCard data-probe="card"><DSInput data-slot="input" data-probe="input" aria-label={copy.label}/><DSInput data-probe="disabled-input" disabled/><DSButton data-slot="button" data-probe="button" onClick={()=>setOpen(true)}>{copy.button}</DSButton><DSButton data-probe="disabled-button" disabled>{copy.button}</DSButton></DSCard>}{native?<Modal title={copy.title} open={open} onCancel={()=>setOpen(false)} footer={null}><Input data-probe="modal-input"/><Button onClick={()=>setOpen(false)}>{copy.close}</Button></Modal>:open&&<dialog ref={e=>e&&!e.open&&e.showModal()} onCancel={()=>setOpen(false)}><p>{copy.title}</p><DSInput data-probe="modal-input"/><DSButton onClick={()=>setOpen(false)}>{copy.close}</DSButton></dialog>}<button data-probe="fake-button" data-slot="button" className="group/button">{copy.button}</button></section>}
 function Host(){return <ConfigProvider theme={{algorithm:theme==='dark'?antTheme.darkAlgorithm:antTheme.defaultAlgorithm,token:{borderRadius:12,colorPrimary:'#405bce',fontFamily:'Inter,system-ui,sans-serif'}}}><Probes id="host"/><AgentUILocaleProvider locale={locale}><AgentUIRoot theme={theme}><div className="shell"><AgentUISidebarFrame defaultActive={null} items={[{id:'business',icon:'list',label:copy.label,content:<Probes id="sidebar"/>}]}><Probes id="root"/><div data-agent-ui-owned="" data-slot="agent-ui-test-container"><Probes id="owned-child"/></div><Dialog><DialogTrigger data-testid="official-dialog">{copy.title}</DialogTrigger><DialogContent><DialogTitle>{copy.title}</DialogTitle><Probes id="official-child"/></DialogContent></Dialog></AgentUISidebarFrame></div></AgentUIRoot><div className="agent-ui-conversation" data-theme={theme}><Probes id="standalone"/></div></AgentUILocaleProvider></ConfigProvider>};createRoot(document.getElementById('root')).render(<Host/>);`);
 server=await createServer({configFile:false,root:fixture,cacheDir:path.join(fixture,'.vite'),plugins:[react(),tailwind()],resolve:{dedupe:['react','react-dom'],alias:{'use-sync-external-store':syncStoreRoot,'zustand':path.resolve('../../packages/react/node_modules/zustand'),antd:b+'/node_modules/antd','@agent-ui/react/styles.css':repo+'/packages/react/dist/styles.css','@agent-ui/react':repo+'/packages/react/dist/index.js'}},optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','antd','@agent-ui/react','@base-ui/react/**','@agent-ui/react','zustand','use-sync-external-store/shim','use-sync-external-store/shim/with-selector']},server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[repo,'/tmp']}}});await server.listen();url=server.resolvedUrls!.local[0]!;
});
test.afterEach(async({},info)=>{const row=rows.at(-1);if(row){row.status=info.status==='passed'?'PASS':'FAIL';row.failures=info.errors.map(e=>e.message);await mkdir(path.join(out,'computed-raw'),{recursive:true});await writeFile(path.join(out,'computed-raw',info.title.replaceAll(' ','-')+'.json'),JSON.stringify(row,null,2));}});
test.afterAll(async()=>{await server?.close();await rm(fixture,{recursive:true,force:true})});
for(const scene of ['B','A','C'])for(const width of [1440,420])for(const theme of ['light','dark'])for(const locale of ['zh-CN','en-US'])test(`${scene} ${width} ${theme} ${locale}`,async({page})=>{
 const row:any={scene,width,theme,locale,comparisons:[],errors:[]};rows.push(row);page.on('pageerror',e=>row.errors.push(e.message));
 await page.setViewportSize({width,height:1000});await page.goto(url+`?scene=${scene}&theme=${theme}&locale=${locale}`);const prefix=`${scene}-${width}-${theme}-${locale}`;
 const control=(region:string,probe:string)=>probe==='card-body'?page.locator(`[data-probes=${region}] .ant-card-body`):page.locator(`[data-probes=${region}] [data-probe=${probe}]`);
 await expect(control('root','input')).toBeVisible();
 for(const region of ['root','owned-child','standalone'])for(const probe of ['input','button','disabled-input','disabled-button','card','fake-button',...(scene==='B'?['list','card-body']:[])]){
  const host=control('host',probe),plugin=control(region,probe);
  for(const state of ['default',...(!probe.includes('disabled')&&['input','button'].includes(probe)?['hover','focus',...(probe==='button'?['active']:[])]:[])]){
   await page.mouse.move(0,0);await page.locator('body').click({position:{x:1,y:1}});
   if(state==='hover')await host.hover();if(state==='focus')await host.focus();if(state==='active'){await host.hover();await page.mouse.down();}await page.waitForTimeout(350);const outside=await style(host);if(state==='active'){await page.mouse.move(0,0);await page.mouse.up();}
   await page.mouse.move(0,0);await page.locator('body').click({position:{x:1,y:1}});if(state==='hover')await plugin.hover();if(state==='focus')await plugin.focus();if(state==='active'){await plugin.hover();await page.mouse.down();}await page.waitForTimeout(350);const inside=await style(plugin);if(state==='active'){await page.mouse.move(0,0);await page.mouse.up();}
   row.comparisons.push({region,probe,state,outside,inside});expect.soft(inside,`${region}/${probe}/${state}`).toEqual(outside);
  }
 }
 await page.screenshot({path:path.join(out,'visual',scene,prefix+'-page.png'),fullPage:true});
 const modalStyles:any={};for(const region of ['host','root']){
  const opener=control(region,'button');await opener.click();const modal=page.locator(scene==='B'?'.ant-modal[role=dialog]:visible':'dialog[open]');await expect(modal).toBeVisible();await page.mouse.move(0,0);await page.waitForTimeout(350);
  modalStyles[region]=await style(modal.locator('[data-probe=modal-input]'));row.portal??={};row.portal[region]=await modal.evaluate(e=>({bodyPortal:!e.closest('[data-agent-ui-root]'),rect:e.getBoundingClientRect().toJSON(),mask:[...document.querySelectorAll('.ant-modal-mask')].filter(m=>getComputedStyle(m).display!=='none').map(m=>({background:getComputedStyle(m).backgroundColor,position:getComputedStyle(m).position,rect:m.getBoundingClientRect().toJSON()}))}));if(scene==='B'){expect.soft(row.portal[region].bodyPortal).toBe(true);expect.soft(row.portal[region].mask.length).toBeGreaterThan(0);for(const mask of row.portal[region].mask){expect.soft(mask.position).toBe('fixed');expect.soft(mask.rect.width).toBe(width);expect.soft(mask.rect.height).toBe(1000);}}await page.screenshot({path:path.join(out,'visual',scene,prefix+'-modal-'+region+'.png'),fullPage:true});
  await modal.locator('input').focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');expect.soft(await modal.evaluate(e=>e.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');await expect(modal).toBeHidden();if(scene==='B')await expect(opener).toBeFocused();
 }
 row.modals=modalStyles;expect.soft(modalStyles.root).toEqual(modalStyles.host);
 expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect.soft(row.errors).toEqual([]);
 row.status=test.info().errors.length?'FAIL':'PASS';
});
for(const scene of ['B','A','C'])for(const width of [1440,420])test(`${scene} ${width} Sidebar and official nesting`,async({page})=>{
 const row:any={scene,width,boundary:true,comparisons:[],errors:[]};rows.push(row);await page.setViewportSize({width,height:1000});await page.goto(url+`?scene=${scene}`);
 const outside=page.locator('[data-probes=host] [data-probe=input]');await expect(outside).toBeVisible();await page.mouse.move(0,0);await page.waitForTimeout(350);const host=await style(outside);const comparable=(value:any)=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='width'));row.containerWidthAllowance='Sidebar/Dialog containers differ; raw width retained, full width comparison belongs to matched-container matrix';
 await page.getByRole('button',{name:'备注',exact:true}).click();const sidebar=page.locator('[data-probes=sidebar] [data-probe=input]');await expect(sidebar).toBeVisible();await sidebar.locator('..').evaluate(e=>{(e as HTMLElement).tabIndex=-1;(e as HTMLElement).focus()});await page.mouse.move(0,0);await page.waitForTimeout(350);row.comparisons.push({region:'sidebar',host,inside:await style(sidebar)});expect.soft(comparable(await style(sidebar))).toEqual(comparable(host));
 if(width===420){await page.keyboard.press('Escape');await expect(sidebar).toBeHidden();}await page.getByTestId('official-dialog').click();const child=page.locator('[data-probes=official-child] [data-probe=input]');await expect(child).toBeVisible();await page.locator('[data-slot=dialog-content]').focus();await page.mouse.move(0,0);await page.waitForTimeout(350);row.officialPortal=await child.evaluate(e=>({agentRoot:!!e.closest('[data-agent-ui-root]'),portalRoot:!!e.closest('[data-agent-ui-portal-root]')}));expect.soft(row.officialPortal.agentRoot).toBe(true);expect.soft(row.officialPortal.portalRoot).toBe(true);row.comparisons.push({region:'official-dialog',host,inside:await style(child)});expect.soft(comparable(await style(child))).toEqual(comparable(host));
 expect.soft(await child.evaluate(e=>e.hasAttribute('data-agent-ui-owned'))).toBe(false);await page.screenshot({path:path.join(out,'visual',scene,scene+'-'+width+'-official-nesting.png'),fullPage:true});await page.keyboard.press('Escape');await expect(child).toBeHidden();await expect(page.getByTestId('official-dialog')).toBeFocused();row.status=test.info().errors.length?'FAIL':'PASS';
});
