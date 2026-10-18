import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { createServer, type ViteDevServer } from 'vite';

const repo = path.resolve('../..');
const output = path.join(repo, 'docs/verification/message-spacing');
const syncStoreRoot = path.dirname(path.dirname(createRequire(import.meta.url).resolve('use-sync-external-store/shim', { paths: [path.join(repo, 'packages/plugins/node_modules/@base-ui/react')] })));
let fixture: string, server: ViteDevServer, url: string;
test.beforeAll(async () => {
  await mkdir(output, {recursive:true});
  fixture = await mkdtemp(path.join(repo, 'apps/creator-workbench/.message-spacing-'));
  await writeFile(path.join(fixture, 'index.html'), '<div id="root"></div><script type="module" src="/fixture.tsx"></script>');
  await writeFile(path.join(fixture, 'style.css'), '@import "@za38.03/agent-ui-plugins/styles.css"; .surface{height:900px}');
  await writeFile(path.join(fixture, 'fixture.tsx'), `
import {createRoot} from 'react-dom/client';
import {AssistantRuntimeProvider,useLocalRuntime} from '@assistant-ui/react';
import {ReasoningRoot,ReasoningTrigger} from 'standalone-reasoning';
import {chartMessageUI} from 'chart-plugin';
import {DataMessageUIRegistration} from '@za38.03/agent-ui-plugins';
const Chart=chartMessageUI.render;
const chartData={title:'Quarterly Sales',items:[{label:'Q1',value:120},{label:'Q2',value:180},{label:'Q3',value:160},{label:'Q4',value:240}]};
import {AgentUIRoot,AgentUILocaleProvider,ConversationThread,ConversationCanonicalReasoningGroup,ConversationCanonicalToolGroup,ConversationThinkingIndicator,ConversationToolTimeline,toConversationMessagePartGroup} from '@za38.03/agent-ui-plugins';
import './style.css';
const params=new URLSearchParams(location.search),scenario=params.get('scenario')||'mixed';
const reasoning=text=>({type:'reasoning',text,status:{type:'complete'}});
const tool={type:'tool-call',toolCallId:'tool-1',toolName:'english_translate_agent',args:{},argsText:'{}',result:'Hello! How can I help you today?'};
const text={type:'text',text:'Hello! How can I help you today?'};
const content=scenario==='text'?[text]:scenario==='empty'?[reasoning(''),{type:'text',text:'  '},text]:[reasoning('Before tool'),...(['reasoning','hidden'].includes(scenario)?[]:[tool]),reasoning('After tool'),{type:'text',text:' '},text];
const wrap=child=><div className="app-ui-plugin-instance" data-plugin-renderer="true">{child}</div>;
function Reasoning({group,children}){return wrap(scenario==='hidden'?null:<ConversationCanonicalReasoningGroup group={toConversationMessagePartGroup(group)}>{children}</ConversationCanonicalReasoningGroup>)}
function Tools({group,children}){return wrap(<ConversationCanonicalToolGroup group={toConversationMessagePartGroup(group)}>{children}</ConversationCanonicalToolGroup>)}
function Thinking(props){return wrap(<ConversationThinkingIndicator {...props}/>)}
function Timeline(props){return wrap(<ConversationToolTimeline {...props}/>)}
let finish;
const adapter={async *run(){yield {content:[{...reasoning('Streaming thought'),status:{type:'running'}}]};await new Promise(resolve=>finish=resolve);yield {content:[reasoning('Streaming thought'),text]}}};
const historyMessage=(id,role,content)=>role==='user'?{id,role,content,createdAt:new Date()}:{id,role,content,status:{type:scenario==='cancelled'||scenario==='error'?'incomplete':'complete',reason:scenario==='cancelled'?'cancelled':scenario==='error'?'error':'stop'},createdAt:new Date(),metadata:{unstable_state:null,unstable_annotations:[],unstable_data:[],steps:[],custom:{}}};
const initialMessages=scenario==='stream'?[]:scenario==='chart'?[historyMessage('assistant-1','assistant',[text,{type:'data',name:'chart',data:chartData}]),historyMessage('assistant-2','assistant',[text])]:scenario==='split'?[historyMessage('request-1','user',[{type:'text',text:'Request one'}]),historyMessage('assistant-1','assistant',[reasoning('Before tool'),tool,reasoning('After tool')]),historyMessage('assistant-2','assistant',[text]),historyMessage('request-2','user',[{type:'text',text:'Request two'}]),historyMessage('assistant-3','assistant',[{type:'text',text:'First paragraph.\\n\\nSecond paragraph.'}])]:[historyMessage('assistant-1','assistant',content)];
function App(){const runtime=useLocalRuntime(adapter,{initialMessages});
return <AgentUILocaleProvider locale="zh-CN"><AgentUIRoot theme={params.get('theme')||'light'}><button data-testid="start" onClick={()=>runtime.thread.append({role:'user',content:[{type:'text',text:'Start'}]})}>Start</button><button data-testid="finish" onClick={()=>finish?.()}>Finish</button><div className="surface agent-ui-conversation"><AssistantRuntimeProvider runtime={runtime}><DataMessageUIRegistration definition={chartMessageUI}/><ConversationThread composer={null} components={params.get('plugins')==='off'?{}:{ReasoningGroup:Reasoning,ToolGroup:Tools,ThinkingIndicator:Thinking,...(scenario==='timeline'?{ToolTimeline:Timeline}:{})}}/></AssistantRuntimeProvider></div>
<div data-testid="standalone-chart"><Chart data={chartData}/></div><div data-testid="standalone"><ReasoningRoot><ReasoningTrigger/></ReasoningRoot></div></AgentUIRoot></AgentUILocaleProvider>};createRoot(document.getElementById('root')).render(<App/>);`);
  server = await createServer({ configFile: false, root: fixture, plugins: [react(), tailwind()],
    resolve: { dedupe: ['react','react-dom','@assistant-ui/react'], alias: {
      'use-sync-external-store': syncStoreRoot,
      '@assistant-ui/react': path.join(repo,'packages/plugins/node_modules/@assistant-ui/react'),
      'zustand': path.join(repo,'packages/plugins/node_modules/zustand'),
      '@za38.03/agent-ui-plugins/styles.css': path.join(repo,'packages/plugins/dist/styles.css'),
      '@za38.03/agent-ui-plugins': path.join(repo,'packages/plugins/dist/index.js'),
      'chart-plugin': path.join(repo,'packages/plugins/resources/registry/items/plugin-chart-message/files/plugins/chart-message/index.tsx'),
      'standalone-reasoning': path.join(repo,'packages/plugins/dist/internal/adapters-generated/assistant-ui/components/assistant-ui/elements/reasoning.js'),
    } }, server: { host: '127.0.0.1', port: 0, hmr: false, fs: { allow: [repo] } } });
  await server.listen(); url = server.resolvedUrls!.local[0]!;
});
test.afterAll(async () => { await server?.close(); if (fixture) await rm(fixture,{recursive:true,force:true}); });

async function checkGaps(page: Page) {
  const gaps = await page.locator('[data-slot="aui_assistant-message-parts"], [data-slot="aui_chain-of-thought"]').evaluateAll(stacks => stacks.flatMap(stack => {
    if (!stack.getClientRects().length) return [];
    const children = Array.from(stack.children).filter(child => child.getClientRects().length);
    return children.slice(1).map((child,i) => child.getBoundingClientRect().top - children[i].getBoundingClientRect().bottom);
  }));
  for (const gap of gaps) expect(gap).toBeCloseTo(16, 0);
  expect(await page.locator('.app-ui-plugin-instance[data-plugin-renderer="true"]:empty').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).display === 'none'))).toBe(true);
  return gaps;
}

for (const theme of ['light','dark','violet']) for (const width of [420,1440]) {
  test(`${theme} ${width}: chart composition`, async ({page}) => {
    await page.setViewportSize({width,height:1100});
    await page.goto(url+'?'+new URLSearchParams({theme,scenario:'chart'}));
    await expect(page.locator('.surface [data-slot="chart-message"]')).toBeVisible();
    const gaps=await page.locator('.surface').evaluate(surface=>{
      const chart=surface.querySelector('[data-slot="chart-message"]')!;
      const paragraphs=surface.querySelectorAll('[data-slot="agent-ui-markdown"] p');
      return {above:chart.getBoundingClientRect().top-paragraphs[0].getBoundingClientRect().bottom,below:paragraphs[1].getBoundingClientRect().top-chart.getBoundingClientRect().bottom};
    });
    expect(gaps.above).toBeCloseTo(16,0); expect(gaps.below).toBeCloseTo(16,0);
    expect(await page.getByTestId('standalone-chart').locator('figure').evaluate(n=>getComputedStyle(n).marginBlock)).toBe('12px');
  });
  test(`${theme} ${width}: split reply and new turn`, async ({page}) => {
    await page.setViewportSize({width,height:1100});
    await page.goto(url+'?'+new URLSearchParams({theme,scenario:'split'}));
    await expect(page.locator('[data-slot="aui_assistant-message-root"]')).toHaveCount(3);
    const metrics=await page.locator('[data-slot="aui_message-group"]').evaluate(group=>{
      const children=Array.from(group.children);
      const assistants=children.filter(node=>node.getAttribute('data-role')==='assistant');
      const p=assistants[1].querySelector('[data-slot="agent-ui-markdown"] p')!;
      const lastParagraphs=assistants[2].querySelectorAll('[data-slot="agent-ui-markdown"] p');
      return {
        continuation:p.getBoundingClientRect().top-assistants[0].querySelectorAll('[data-slot="reasoning-root"]')[1].getBoundingClientRect().bottom,
        boundaries:children.slice(1).map((node,i)=>({continuation:node.getAttribute('data-assistant-turn-continuation')==='true',gap:node.getBoundingClientRect().top-children[i].getBoundingClientRect().bottom})),
        paragraphGap:lastParagraphs[1].getBoundingClientRect().top-lastParagraphs[0].getBoundingClientRect().bottom,
      };
    });
    expect(metrics.continuation).toBeCloseTo(16,0);
    for(const boundary of metrics.boundaries) expect(boundary.gap).toBeCloseTo(boundary.continuation?16:theme==='violet'?28:24,0);
    expect(metrics.paragraphGap).toBeGreaterThan(0);
  });
  test(`${theme} ${width}: combinations and disclosures`, async ({page}) => {
    const errors: string[] = []; page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height:1100});
    for (const scenario of ['text','empty','reasoning','mixed','hidden','timeline','cancelled','error']) for (const plugins of ['on','off']) {
      await page.goto(url+'?'+new URLSearchParams({theme,scenario,plugins}));
      await expect(page.locator('[data-slot="agent-ui-markdown"]').first()).toContainText('Hello!');
      const gaps = await checkGaps(page);
      if (scenario==='mixed' && plugins==='on') {
        expect(gaps.length).toBeGreaterThan(0);
        await writeFile(path.join(output,`${theme}-${width}.json`),JSON.stringify({scenario,plugins,gaps},null,2));
        await page.locator('[data-slot="aui_assistant-message-root"]').screenshot({path:path.join(output,`${theme}-${width}.png`)});
      }
      if (scenario==='empty') await expect(page.locator('.surface [data-slot="reasoning-root"]')).toHaveCount(0);
      if (scenario==='hidden' && plugins==='on') {
        const emptyGroups=page.locator('[data-slot="aui_chain-of-thought"]:not(:has(> :not(:empty)))');
        await expect(emptyGroups).toHaveCount(1);
        expect(await emptyGroups.evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).display==='none'))).toBe(true);
      }
      const triggers = page.locator('[data-slot="aui_assistant-message-parts"] button[aria-expanded]');
      for (let i=0;i<await triggers.count();i++) {
        await triggers.nth(i).click(); await page.waitForTimeout(250); await checkGaps(page);
        await triggers.nth(i).click(); await page.waitForTimeout(250); await checkGaps(page);
      }
      expect(await page.getByTestId('standalone').locator('[data-slot="reasoning-root"]').evaluate(node=>getComputedStyle(node).marginBottom)).toBe('16px');
    }
    expect(errors).toEqual([]);
  });
  test(`${theme} ${width}: stream to complete`, async ({page}) => {
    await page.setViewportSize({width,height:1100});
    await page.goto(url+'?'+new URLSearchParams({theme,scenario:'stream'}));
    await page.getByTestId('start').click();
    await expect(page.locator('[data-slot="reasoning-root"][data-agent-state="running"]')).toBeVisible();
    await page.waitForTimeout(250); await checkGaps(page);
    await page.getByTestId('finish').click();
    await expect(page.locator('[data-slot="agent-ui-markdown"]').last()).toContainText('Hello!');
    await expect(page.locator('.surface [data-slot="reasoning-root"]')).toHaveAttribute('data-agent-state','idle');
    await page.waitForTimeout(250); await checkGaps(page);
  });
}
