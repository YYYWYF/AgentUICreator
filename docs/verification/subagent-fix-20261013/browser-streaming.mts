import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createI18nPluginHost } from '../../../apps/creator-workbench/tests/support/i18n-plugin-visual-host.ts';
import { readReleasePluginCoverage } from '../../../apps/creator-workbench/tests/support/i18n-plugin-visual-coverage.ts';
import { nestedSubagentTaskGroupScenario,nestedSubagentConversationScenario,runMockScenario } from '../../../packages/mock-agent/src/index.ts';
process.chdir(fileURLToPath(new URL('../../../',import.meta.url)));
const {chromium,expect}=createRequire(path.resolve('apps/creator-workbench/package.json'))('@playwright/test');
const output=path.resolve('docs/verification/subagent-fix-20261013');await mkdir(output,{recursive:true});
const {releaseIds}=await readReleasePluginCoverage();const host=await createI18nPluginHost(releaseIds);let browser;const results=[];
async function openCards(page){for(let i=0;i<12;i++){const b=page.locator('[data-slot="task-card"] > button[aria-expanded="false"]').first();if(!await b.count())break;await b.click();}}
try{
 browser=await chromium.launch({headless:true});
 for(const mode of ['streaming','stop','interleaved-siblings','parent-error']){
  const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   if(mode==='interleaved-siblings')await page.route('**/agent?**',async route=>{
    const input=route.request().postDataJSON();const events=[];for await(const e of runMockScenario(input,nestedSubagentTaskGroupScenario,{timingScale:0}))events.push(e);
    const starts=events.filter(e=>e.type==='SUBAGENT_STARTED');
    const tagged=new Map(starts.map(e=>[e.subagentRunId,events.filter(v=>v.subagentRunId===e.subagentRunId&&!v.type.startsWith('SUBAGENT_'))]));
    const interleaved=[];for(let i=0;i<Math.max(...[...tagged.values()].map(a=>a.length));i++)for(const list of tagged.values())if(list[i])interleaved.push(list[i]);
    const reordered=[...events.filter(e=>e.subagentRunId===undefined&&e.type!=='TOOL_CALL_RESULT'&&e.type!=='RUN_FINISHED'),...starts,...interleaved,...events.filter(e=>e.type==='SUBAGENT_FINISHED'),...events.filter(e=>e.type==='TOOL_CALL_RESULT'&&e.subagentRunId===undefined),...events.filter(e=>e.type==='RUN_FINISHED')];
    await writeFile(path.join(output,'interleaved-agui-events.json'),JSON.stringify(reordered,null,2));
    await route.fulfill({contentType:'text/event-stream',body:reordered.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});
   });
   if(mode==='parent-error')await page.route('**/agent?**',async route=>{
    const input=route.request().postDataJSON();const events=[];
    for await(const e of runMockScenario(input,nestedSubagentConversationScenario,{timingScale:0})){
     events.push(e);if(e.type==='TEXT_MESSAGE_CONTENT'&&e.subagentRunId==='researcher-1')break;
    }
    events.push({type:'RUN_ERROR',message:'Root run failed',code:'ROOT_FAILED'});
    await route.fulfill({contentType:'text/event-stream',body:events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});
   });
   await page.goto(`${host.url}?locale=zh-CN&scenario=nested-subagent-conversation&speed=1`,{waitUntil:'networkidle'});
   const input=page.locator('.aui-composer-root').getByRole('textbox');await input.fill('Verify '+mode);await input.press('Enter');
   await expect(page.locator('[data-slot="task-card"]').first()).toBeVisible({timeout:30000});await openCards(page);
   if(mode==='parent-error'){
    await expect(page.locator('.aui-composer-send')).toBeVisible({timeout:30000});await openCards(page);
    await expect(page.locator('[data-slot="task-card"]')).toHaveAttribute('data-state','failed');
    await expect(page.locator('[data-slot="task-card-transcript"]')).toContainText('我先检查');
    await expect(page.locator('[data-slot="aui_task-transcript-message"] [role="alert"]')).toContainText('Root run failed');
   }else if(mode==='interleaved-siblings'){
    await expect(page.locator('.aui-composer-send')).toBeVisible({timeout:30000});await openCards(page);
    await expect(page.locator('[data-slot="task-card"][data-state="done"]')).toHaveCount(3);
    const cards=page.locator('[data-slot="task-card"]');
    const texts=['Architecture inspection complete.','Conversation Runtime inspection complete.','Conversation UI review complete.'];
    for(let i=0;i<3;i++){await expect(cards.nth(i).locator('[data-slot="task-card-transcript"]')).toContainText(texts[i]);for(let j=0;j<3;j++)if(i!==j)await expect(cards.nth(i).locator('[data-slot="task-card-transcript"]')).not.toContainText(texts[j]);}
   }else{
    await expect(page.locator('[data-slot="task-card"]').first()).toHaveAttribute('data-state','working');
    await expect(page.locator('[data-slot="task-card-transcript"]')).toContainText('我先检查',{timeout:15000});
    await expect(page.locator('.aui-composer-cancel')).toBeVisible();
    await page.screenshot({path:path.join(output,mode+'-running.png'),fullPage:true});
    if(mode==='stop'){
     await writeFile(path.join(output,'stop-before-native-messages.json'),JSON.stringify(await page.evaluate(()=>window.__i18nProbe.runtime.options.runtime.thread.getState().messages),null,2));
     await writeFile(path.join(output,'stop-before-snapshot.json'),JSON.stringify(await page.evaluate(()=>window.__i18nProbe.runtime.getSnapshot()),null,2));
     await page.locator('.aui-composer-cancel').click();await expect(page.locator('.aui-composer-send')).toBeVisible();
     await page.waitForTimeout(250);await writeFile(path.join(output,'stop-after-native-messages.json'),JSON.stringify(await page.evaluate(()=>window.__i18nProbe.runtime.options.runtime.thread.getState().messages),null,2));
     await writeFile(path.join(output,'stop-after-snapshot.json'),JSON.stringify(await page.evaluate(()=>window.__i18nProbe.runtime.getSnapshot()),null,2));
     await expect(page.locator('[data-slot="task-card"]')).toHaveAttribute('data-state','cancelled');
     await expect(page.locator('[data-slot="task-card"] > button')).toHaveAttribute('aria-expanded','true');
     if(!await page.locator('[data-slot="task-card-transcript"]').count())throw new Error('Subagent transcript unavailable after Stop; only cancelled ToolFallback remains.');
     const stoppedText=await page.locator('[data-slot="task-card-transcript"]').innerText();await page.waitForTimeout(2000);
     expect(await page.locator('[data-slot="task-card-transcript"]').innerText()).toBe(stoppedText);
     await expect(page.locator('[data-slot="task-card-transcript"]')).not.toContainText('检查完成：Conversation Runtime');
    }else{
     await expect(page.locator('.aui-composer-send')).toBeVisible({timeout:30000});await expect(page.locator('[data-slot="task-card"]')).toHaveAttribute('data-state','done');
     await writeFile(path.join(output,'completion-disclosure.json'),JSON.stringify({expanded:await page.locator('[data-slot="task-card"] > button').first().getAttribute('aria-expanded')},null,2));
     await expect(page.locator('[data-slot="task-card"] > button')).toHaveAttribute('aria-expanded','true');
     await expect(page.locator('[data-slot="task-card-transcript"]')).toContainText('检查完成：Conversation Runtime');
    }
   }
   expect(errors).toEqual([]);await page.screenshot({path:path.join(output,mode+'-complete.png'),fullPage:true});results.push({mode,status:'passed',pageerrors:errors});console.log('PASS',mode);
  }catch(error){results.push({mode,status:'failed',error:String(error),pageerrors:errors});console.log('FAIL',mode,String(error));await page.screenshot({path:path.join(output,mode+'-failed.png'),fullPage:true});}finally{await page.close();}
 }
}finally{await browser?.close();await host.close();await writeFile(path.join(output,'streaming-results.json'),JSON.stringify(results,null,2)+'\n');}
if(results.some(r=>r.status==='failed'))process.exitCode=1;
