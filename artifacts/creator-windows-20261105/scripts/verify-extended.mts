import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnectionHostFixture } from './connection-host.mts';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../local-runs');
const caseId=process.argv[2]??'case07-sales';
const pointer=process.env.AGENT_UI_QA_SOURCE_RUN?{out:path.resolve(process.env.AGENT_UI_QA_SOURCE_RUN)}:JSON.parse(await readFile(path.join(base,'latest-'+caseId+'-resume262k.json'),'utf8'));
const source=path.join(pointer.out,'host');
const out=path.join(base,caseId+'-extended-'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(out,{recursive:true});
const testCase=JSON.parse(await readFile(path.join(repo,'artifacts/creator-complex-scenarios-20261104/questions.json'),'utf8')).find((item:any)=>item.id===caseId);
const {chromium,expect}=createRequire(path.join(repo,'apps/creator-workbench/package.json'))('@playwright/test');
async function hashes(root:string,dir=path.join(root,'src/agent-ui')):Promise<Record<string,string>>{
 const result:Record<string,string>={};for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())Object.assign(result,await hashes(root,file));else if(entry.isFile())result[path.relative(path.join(root,'src/agent-ui'),file).split(path.sep).join('/')]=createHash('sha256').update(await readFile(file)).digest('hex');}return result;
}
const originalHashes=await hashes(source);
const result:any={caseId,source:pointer.out,scope:'Extra browser checks of unchanged model output. Synthetic events travel through the existing HTTP SSE endpoint. Locale buttons are in the QA Host, outside Agent UI implementation.',checks:[],browserErrors:[],consoleErrors:[],events:[]};
let fixture:any,browser:any,page:any;
const check=async(name:string,run:()=>Promise<void>)=>{try{await run();result.checks.push({name,status:'passed'});}catch(error:any){result.checks.push({name,status:'failed',error:error.message});}};
try{
 fixture=await createConnectionHostFixture({projectChecks:true,prepareHost:async(root:string)=>cp(path.join(source,'src/agent-ui'),path.join(root,'src/agent-ui'),{recursive:true})});fixture.enableCors();
 await writeFile(path.join(fixture.hostRoot,'src/main.tsx'),`import {createRoot} from "react-dom/client";import {useState} from "react";import {Agent} from "./agent-ui";import "./host.css";
function QAHost(){const [locale,setLocale]=useState<"zh-CN"|"en-US">("zh-CN");return <div style={{height:"100dvh"}}><div style={{height:32}}><button data-qa-locale="en-US" onClick={()=>setLocale("en-US")}>QA English</button><button data-qa-locale="zh-CN" onClick={()=>setLocale("zh-CN")}>QA Chinese</button></div><div style={{height:"calc(100% - 32px)"}}><Agent locale={locale} endpoint={${JSON.stringify(fixture.agentEndpoint)}}/></div></div>;}createRoot(document.getElementById("root")!).render(<QAHost/>);`);
 fixture.refreshHostEntry();browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1680,height:1050}});
 page.on('pageerror',(error:any)=>result.browserErrors.push(error.message));page.on('console',(message:any)=>{if(message.type()==='error')result.consoleErrors.push(message.text());});
 await page.goto(fixture.hostOrigin);
 const surface=page.locator('[data-ui-plugin="conversation-surface"]'),editor=page.locator('.aui-composer-root').getByRole('textbox');
 const start=async(label:string)=>{const count=fixture.runCount();await editor.fill(label);await page.locator('.aui-composer-send').click();await expect.poll(()=>fixture.runCount(),{timeout:12000}).toBe(count+1);};
 const emit=async(events:any[])=>{result.events.push(...events);fixture.emitEvents(events);await page.waitForTimeout(150);};
 const finish=async()=>{fixture.finishRun();await expect(page.getByRole('button',{name:/停止生成|Stop generating/i})).toHaveCount(0);};
 if(caseId==='case07-sales'){
  await start('语言和数值边界检查');await emit([testCase.event]);await finish();const table=surface.getByRole('table').first();
  await check('keyboard toggles row details',async()=>{const row=table.getByRole('row').filter({hasText:'2026-09'});await row.focus();await page.keyboard.press('Enter');await expect(row).toHaveAttribute('aria-expanded','true');await page.keyboard.press(' ');await expect(row).toHaveAttribute('aria-expanded','false');await row.click();await expect(row).toHaveAttribute('aria-expanded','true');});
  await check('locale changes keep expanded row and sort direction',async()=>{const header=table.getByRole('columnheader',{name:/收入/});const previous=await header.getAttribute('aria-sort');await header.getByRole('button').click();const direction=await header.getAttribute('aria-sort');expect(direction).not.toBe(previous);await page.locator('[data-qa-locale="en-US"]').click();await expect(table.getByRole('columnheader',{name:/Revenue/})).toBeVisible();await expect(table.getByRole('row').filter({hasText:'2026-09'})).toHaveAttribute('aria-expanded','true');await expect(table.getByRole('columnheader',{name:/Revenue/})).toHaveAttribute('aria-sort',direction);await expect(surface.getByText(/Orders.*320/).last()).toBeVisible();await page.locator('[data-qa-locale="zh-CN"]').click();await expect(table.getByRole('columnheader',{name:/收入/})).toBeVisible();});
  await check('actual numeric zero remains a valid value',async()=>{const event=structuredClone(testCase.event);event.value.payload=JSON.stringify({title:'真实零值',rows:[{month:'2026-12',revenue:0,order_count:0}]});await start('真实零值');await emit([event]);await finish();const row=surface.getByRole('row').filter({hasText:'2026-12'});await expect(row).toBeVisible();await expect(row.getByRole('cell').nth(1)).toHaveText('0');});
  await check('later messages preserve earlier row interaction state',async()=>{const row=table.getByRole('row').filter({hasText:'2026-09'});if(await row.getAttribute('aria-expanded')!=='true')await row.click();await expect(row).toHaveAttribute('aria-expanded','true');await start('后续消息');await emit([testCase.event]);await finish();await expect(row).toHaveAttribute('aria-expanded','true');});
  await check('malformed numeric fields do not become fabricated zero',async()=>{const event=structuredClone(testCase.event);event.value.payload=JSON.stringify({title:'数值类型异常',rows:[{month:'2026-11',revenue:'bad',order_count:null}]});await start('异常数值');await emit([event]);await finish();const row=surface.getByRole('row').filter({hasText:'2026-11'});if(await row.count()){expect((await row.getByRole('cell').nth(1).innerText()).trim()).not.toBe('0');await row.click();await expect(row.locator('xpath=following-sibling::tr[1]')).toContainText(/(?:订单数|Orders).*—/);}await expect(editor).toBeEditable();});
  await check('missing numeric fields stay distinguishable from zero',async()=>{const event=structuredClone(testCase.event);event.value.payload=JSON.stringify({title:'缺失数值',rows:[{month:'2027-01'}]});await start('缺失数值');await emit([event]);await finish();const row=surface.getByRole('row').filter({hasText:'2027-01'});await expect(row.getByRole('cell').nth(1)).toHaveText('—');await row.click();await expect(row.locator('xpath=following-sibling::tr[1]')).toContainText(/(?:订单数|Orders).*—/);});
  await check('empty report has an honest empty state',async()=>{const event=structuredClone(testCase.event);event.value.payload=JSON.stringify({title:'空报表',rows:[]});await start('空报表');await emit([event]);await finish();await expect(surface.getByText(/暂无数据|暂无销售数据|No (?:sales )?data|No rows/i).last()).toBeVisible();await expect(editor).toBeEditable();});
 }else if(caseId==='case05-order'){
  await check('order product text is displayed literally',async()=>{
   const event=structuredClone(testCase.event);event.value.order_no='O-TEXT';event.value.items=[{name:'<b data-qa-injected>商品文本</b>',quantity:1,unit_price:0}];event.value.total_amount=0;
   await start('订单文本和零金额');await emit([event]);await finish();
   await expect(surface.getByText('<b data-qa-injected>商品文本</b>',{exact:true})).toBeVisible();await expect(page.locator('[data-qa-injected]')).toHaveCount(0);
  });
  await check('nested malformed order fields do not crash the conversation',async()=>{
   const event=structuredClone(testCase.event);event.value={order_no:'O-NESTED',status:{bad:true},currency:{bad:true},total_amount:null,items:[null,{name:{bad:true},quantity:[],unit_price:{bad:true}}]};
   await start('订单嵌套异常');await emit([event]);await finish();await expect(editor).toBeEditable();await expect(page.locator('[data-plugin-state="error"]')).toHaveCount(0);expect(result.browserErrors).toHaveLength(0);
  });
 }else if(caseId==='case06-inspection'){
  await start('检查结果文本边界');
  const event=structuredClone(testCase.event);event.value={target:'边界服务',checks:[{name:'<b data-qa-injected>检查项文本</b>',status:'failed',detail:{code:'E_TEXT',message:'<b data-qa-injected>故障信息</b>',duration_ms:0}}]};
  await emit([event]);await finish();
  await check('inspection error details are literal text',async()=>{
   await surface.getByText('<b data-qa-injected>检查项文本</b>',{exact:true}).click();await expect(surface.getByText('<b data-qa-injected>故障信息</b>',{exact:true})).toBeVisible();await expect(page.locator('[data-qa-injected]')).toHaveCount(0);
  });
  await check('locale update keeps failure details expanded',async()=>{
   await expect(surface.getByText('E_TEXT',{exact:false})).toBeVisible();await page.locator('[data-qa-locale="en-US"]').click();await expect(surface.getByText('E_TEXT',{exact:false})).toBeVisible();await page.locator('[data-qa-locale="zh-CN"]').click();
  });
  await check('nested malformed inspection fields do not crash the conversation',async()=>{
   const invalid=structuredClone(testCase.event);invalid.value={target:{bad:true},checks:[null,{name:{bad:true},status:'failed',detail:{code:{bad:true},message:{bad:true},duration_ms:[]}}]};
   await start('检查结果嵌套异常');await emit([invalid]);await finish();await expect(editor).toBeEditable();await expect(page.locator('[data-plugin-state="error"]')).toHaveCount(0);expect(result.browserErrors).toHaveLength(0);
  });
 }else if(caseId==='case08-progress'){
  await start('任务状态边界检查');await emit([testCase.event]);
  await check('locale changes keep existing progress',async()=>{await expect(page.getByText('生成销售报告',{exact:true})).toBeVisible();await page.locator('[data-qa-locale="en-US"]').click();await expect(page.getByText('Job progress',{exact:true})).toBeVisible();await expect(page.getByText('生成销售报告',{exact:true})).toHaveCount(1);await page.locator('[data-qa-locale="zh-CN"]').click();await expect(page.getByText('任务进度',{exact:true})).toBeVisible();});
  await check('duplicate delivery does not duplicate job',async()=>{await emit([testCase.event,testCase.event]);await expect(page.getByText('生成销售报告',{exact:true})).toHaveCount(1);});
  await check('unknown status does not crash UI or corrupt existing job',async()=>{const event=structuredClone(testCase.event);event.value={...event.value,job_id:'J-UNKNOWN',title:'未知状态任务',status:'paused'};await emit([event]);await expect(page.locator('[data-plugin-state="error"]')).toHaveCount(0);await expect(page.getByText('生成销售报告',{exact:true})).toHaveCount(1);await expect(editor).toBeEditable();});
  await finish();
 }else throw Error('Unsupported extended case');
 await page.screenshot({path:path.join(out,'verified.png'),fullPage:true});
 const after=await hashes(fixture.hostRoot);result.sourceDifferences=[...new Set([...Object.keys(originalHashes),...Object.keys(after)])].filter(file=>originalHashes[file]!==after[file]);result.sourceUnchanged=result.sourceDifferences.length===0;
 result.status=result.checks.every((item:any)=>item.status==='passed')&&!result.browserErrors.length&&result.sourceUnchanged?'passed':'failed';
}catch(error:any){result.status='HARNESS_ERROR';result.error=error.message;}
finally{await browser?.close();try{await fixture?.close();result.cleanup=true;}catch(error:any){result.cleanup={code:error.code,message:error.message};}await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({out,...result,events:undefined},null,2));if(result.status!=='passed'||result.cleanup!==true)process.exitCode=1;}
