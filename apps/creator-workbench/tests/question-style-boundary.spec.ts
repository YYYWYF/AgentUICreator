import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, type Locator } from '@playwright/test';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { createServer, type ViteDevServer } from 'vite';
const repo = path.resolve('../..');
const output = path.join(repo, 'docs/verification/question-style-boundary');
const syncStoreRoot = path.dirname(path.dirname(createRequire(import.meta.url).resolve('use-sync-external-store/shim', { paths: [path.join(repo, 'packages/react/node_modules/@base-ui/react')] })));
let fixture: string, server: ViteDevServer, url: string;
test.beforeAll(async () => {
  await mkdir(output, { recursive: true });
  fixture = await mkdtemp(path.resolve('.question-style-'));
  await writeFile(path.join(fixture, 'index.html'), '<div id="root"></div><script type="module" src="/fixture.tsx"></script>');
  await writeFile(path.join(fixture, 'style.css'), `@import "@agent-ui/react/styles.css"; body{margin:0} .surface{padding:16px;max-width:700px} .business{font:16px Arial;padding:9px 13px;border:2px solid tomato;background:beige;border-radius:3px;box-sizing:content-box} .probe{margin-bottom:24px}`);
  await writeFile(path.join(fixture, 'fixture.tsx'), `
import {useState} from 'react';import {createRoot} from 'react-dom/client';
import {AgentUIRoot,AgentUILocaleProvider,ConversationQuestionFlow,ConversationOptionList,Collapsible,CollapsibleTrigger,CollapsibleContent,AgentPlan,SubagentList,Badge,Skeleton,Input,ConversationSource} from '@agent-ui/react';
import {OptionList as Before} from '${path.join(repo, 'packages/react/dist/internal/vendor/assistant-ui/components/assistant-ui/elements/option-list.js').replaceAll('\\', '/')}';
import './style.css';
const params=new URLSearchParams(location.search),locale=params.get('locale')||'zh-CN',theme=params.get('theme')||'light',zh=locale==='zh-CN';
const options=[{id:'dashboard',label:'Dashboard',description:zh?'适合信息密度较高的首页':'For a dense home page'},{id:'sidebar',label:'Sidebar',description:zh?'适合有持续导航的首页':'For persistent navigation'},{id:'disabled',label:zh?'不可用':'Unavailable',disabled:true}];
const labels=zh?{back:'返回',next:'下一步',submit:'提交',submitting:'提交中',answered:'已回答',noneSelected:'未选择'}:{back:'Back',next:'Next',submit:'Submit',submitting:'Submitting',answered:'Answered',noneSelected:'None selected'};
const steps=[{id:'layout',question:zh?'你希望采用哪种首页布局？':'Which home layout?',description:zh?'这个选择会影响首页的整体结构。':'This affects the home structure.',options,selectionMode:'single',minSelections:1,maxSelections:1}];
function App(){const[choice,setChoice]=useState();const[answer,setAnswer]=useState('');return <AgentUILocaleProvider locale={locale}><button className="business" data-testid="business-outside">Business</button><AgentUIRoot theme={theme}><div className="surface">
<div className="probe" data-testid="before"><Before options={options} onConfirm={()=>new Promise(()=>{})}/></div>
<div className="probe" data-testid="pending"><ConversationQuestionFlow steps={steps} labels={labels} onComplete={()=>new Promise(()=>{})}/></div>
<div className="probe" data-testid="complete"><ConversationQuestionFlow steps={steps} labels={labels} choice={choice} onComplete={answers=>{setChoice(answers)}}/></div>
<div className="probe" data-testid="multiple"><ConversationOptionList options={options} selectionMode="multiple" maxSelections={2} onConfirm={ids=>setAnswer(ids.join(','))}/><output>{answer}</output></div>
<div className="probe" data-testid="readonly"><ConversationQuestionFlow steps={steps} labels={labels}/></div>
<div className="probe" data-testid="plan"><AgentPlan title="Plan" steps={['Alpha','Beta']} activeIndex={1}/></div>
<div className="probe" data-testid="subagents"><SubagentList agents={[{name:'Alpha',model:'model'}]} completedCount={0} progress={[50]} showSummary={false} summaryAgent={{name:'Summary',model:'model'}}/></div>
<Badge data-testid="badge">Badge</Badge><Skeleton data-testid="skeleton" className="h-4 w-20"/><Input data-testid="input"/><div data-testid="source"><ConversationSource sourceType="document" id="document" title="Document" mediaType="text/plain"/></div><Collapsible><CollapsibleTrigger data-testid="collapse">Details</CollapsibleTrigger><CollapsibleContent><button className="business" data-testid="business-inside">Business</button></CollapsibleContent></Collapsible>
</div></AgentUIRoot></AgentUILocaleProvider>};createRoot(document.getElementById('root')).render(<App/>);`);
  server = await createServer({ configFile:false, root:fixture, cacheDir:path.join(fixture,'.vite'), plugins:[react(),tailwind()], resolve:{dedupe:['react','react-dom'],alias:{'use-sync-external-store':syncStoreRoot,'zustand':path.join(repo,'packages/react/node_modules/zustand'),'@agent-ui/react/styles.css':path.join(repo,'packages/react/dist/styles.css'),'@agent-ui/react':path.join(repo,'packages/react/dist/index.js')}}, optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','@agent-ui/react','@base-ui/react/**','zustand','use-sync-external-store/shim','use-sync-external-store/shim/with-selector']},server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[repo]}}});
  await server.listen(); url=server.resolvedUrls!.local[0]!;
});
test.afterAll(async()=>{await server?.close();if(fixture)await rm(fixture,{recursive:true,force:true});});
const styles=(node:Locator)=>node.evaluate(el=>{const css=getComputedStyle(el);return Object.fromEntries(['border-width','border-style','background-color','padding','border-radius','font-family','font-size','box-sizing','outline-style','outline-width'].map(key=>[key,css.getPropertyValue(key)]));});
for(const theme of ['light','dark','violet'])for(const width of [420,1440])for(const locale of ['zh-CN','en-US'])test(`${theme} ${width} ${locale}`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width,height:1100});await page.goto(url+'?'+new URLSearchParams({theme,locale}));
 const pending=page.getByTestId('pending');const button=pending.getByRole('button',{name:/Dashboard/});await expect(button).toBeVisible();
 const record:any={before:await styles(page.getByTestId('before').getByRole('button',{name:/Dashboard/})),after:await styles(button)};
 expect(record.before['border-style']).toBe('outset');expect(record.before['border-width']).toBe('2px');
 expect(record.after['border-width']).toBe('0px');expect(record.after['background-color']).toBe('rgba(0, 0, 0, 0)');expect(record.after['box-sizing']).toBe('border-box');expect(record.after.padding).toBe('8px');
 await page.addStyleTag({content:'button { border: 5px outset red; padding: 2px 6px; background: pink; font: 20px serif; border-radius: 0; box-sizing: content-box; }'});
 record.hostReset=await styles(button);expect(record.hostReset).toEqual(record.after);
 if(theme==='light'&&width===420&&locale==='zh-CN')await pending.screenshot({path:path.join(output,'question-fixed.png')});
 await button.hover();record.hover=await styles(button);expect(record.hover['background-color']).not.toBe(record.after['background-color']);
 await button.focus();record.focus=await button.evaluate(el=>({focusVisible:el.matches(':focus-visible'),shadow:getComputedStyle(el).boxShadow}));expect(record.focus.focusVisible).toBe(true);expect(record.focus.shadow).not.toBe('none');
 await page.mouse.move(0,0);await page.screenshot({path:path.join(output,`${theme}-${width}-${locale}-open.png`),fullPage:true});
 await button.click();await expect(pending.locator('[data-slot=option-list]')).toHaveAttribute('data-state','pending');await expect(pending.getByRole('status')).toHaveText(locale==='zh-CN'?'提交中':'Submitting');
 await page.getByTestId('complete').getByRole('button',{name:/Dashboard/}).click();await expect(page.getByTestId('complete').locator('[data-state=receipt]')).toContainText('Dashboard');
 const multi=page.getByTestId('multiple');await multi.getByRole('checkbox',{name:/Dashboard/}).click();await expect(multi.getByRole('checkbox',{name:/Dashboard/})).toHaveAttribute('aria-checked','true');await multi.getByRole('button',{name:locale==='zh-CN'?'确认':'Confirm',exact:true}).click();await expect(multi.locator('output')).toHaveText('dashboard');await expect(multi.locator('[data-state=receipt]')).toContainText(locale==='zh-CN'?'已选择：':'Selected:');
 await expect(page.getByTestId('readonly').getByRole('button')).toHaveCount(0);
 for(const id of ['plan','subagents']){const el=page.getByTestId(id).locator('[role=progressbar]').first();await expect(el).toHaveAttribute('data-agent-ui-owned','');expect(await el.evaluate(n=>getComputedStyle(n).height)).toBe('3px');}
 await page.getByTestId('collapse').click();record.businessOutside=await styles(page.getByTestId('business-outside'));record.businessInside=await styles(page.getByTestId('business-inside'));expect(record.businessInside).toEqual(record.businessOutside);expect((await styles(page.getByTestId('collapse')))['border-width']).toBe('0px');
 for(const id of ['badge','skeleton','input']){await expect(page.getByTestId(id)).toHaveAttribute('data-agent-ui-owned','');expect((await styles(page.getByTestId(id)))['box-sizing']).toBe('border-box');}
 await expect(page.getByTestId('source').locator('[data-slot=source-title]')).toHaveAttribute('data-agent-ui-owned','');
 record.overflow=await page.locator('.surface').evaluate(el=>Array.from(el.querySelectorAll('[data-slot=option-list]')).some(n=>n.getBoundingClientRect().right>el.getBoundingClientRect().right));expect(record.overflow).toBe(false);expect(errors).toEqual([]);
 await page.screenshot({path:path.join(output,`${theme}-${width}-${locale}-answered.png`),fullPage:true});await writeFile(path.join(output,`${theme}-${width}-${locale}.json`),JSON.stringify(record,null,2));
});
