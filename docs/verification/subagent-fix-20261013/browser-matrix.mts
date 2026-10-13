import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../../../',import.meta.url))); 
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createI18nPluginHost } from '../../../apps/creator-workbench/tests/support/i18n-plugin-visual-host.ts';
import { readReleasePluginCoverage } from '../../../apps/creator-workbench/tests/support/i18n-plugin-visual-coverage.ts';
const {chromium,expect}=createRequire(path.resolve('apps/creator-workbench/package.json'))('@playwright/test');
const output=path.resolve('docs/verification/subagent-fix-20261013');
await mkdir(output,{recursive:true});
const {releaseIds}=await readReleasePluginCoverage();
const host=await createI18nPluginHost(releaseIds);
let browser;
const results=[];
async function openCards(page){
 for(let i=0;i<12;i++){
  const button=page.locator('[data-slot="task-card"] > button[aria-expanded="false"]').first();
  if(!await button.count())break;
  await button.click();
 }
}
const cases=[
 {id:'nested-subagent-conversation',cards:1,text:'检查完成：Conversation Runtime'},
 {id:'nested-subagent-recursive',cards:2,text:'Subagent B 已完成 Runtime 检查。'},
 {id:'nested-subagent-error',cards:1,text:'我已经定位到失败分支'},
 {id:'nested-subagent-task-group',cards:3,text:'Conversation UI review complete.'},
];
try{
 browser=await chromium.launch({headless:true});
 for(const locale of ['zh-CN','en-US'])for(const width of [1440,420])for(const item of cases){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const entry={locale,width,scenario:item.id};
  try{
   await page.goto(`${host.url}?locale=${locale}&scenario=${item.id}&speed=0.1`,{waitUntil:'networkidle'});
   await expect(page.locator('[data-ui-plugin="conversation-surface"]')).toBeVisible();
   const input=page.locator('.aui-composer-root').getByRole('textbox');
   await input.fill('Subagent compatibility verification');await input.press('Enter');
   await expect(page.locator('[data-slot="task-card"]').first()).toBeVisible({timeout:30000});
   await expect(page.locator('.aui-composer-send')).toBeVisible({timeout:30000});
   await openCards(page);
   await expect(page.locator('[data-slot="task-card"]')).toHaveCount(item.cards);
   await expect(page.locator('[data-slot="task-card-transcript"]').filter({hasText:item.text}).first()).toBeVisible();
   await expect(page.locator('[data-slot="task-card"][data-state="done"]')).toHaveCount(item.cards);
   if(item.id==='nested-subagent-error')await expect(page.locator('[data-slot="aui_task-transcript-message"] [role="alert"]')).toContainText('Researcher failed during runtime inspection');
   if(item.id==='nested-subagent-recursive')await expect(page.locator('[data-slot="task-card"] [data-slot="task-card"]')).toHaveCount(1);
   expect(errors).toEqual([]);
   await page.screenshot({path:path.join(output,`${locale}-${width}-${item.id}.png`),fullPage:true});
   results.push({...entry,status:'passed',pageerrors:errors});console.log('PASS',JSON.stringify(entry));
  }catch(error){results.push({...entry,status:'failed',error:String(error),pageerrors:errors});console.log('FAIL',JSON.stringify(entry),String(error));await page.screenshot({path:path.join(output,`${locale}-${width}-${item.id}-failed.png`),fullPage:true});}
  finally{await page.close();}
 }
}finally{await browser?.close();await host.close();await writeFile(path.join(output,'browser-results.json'),JSON.stringify(results,null,2)+'\n');}
if(results.some(r=>r.status==='failed'))process.exitCode=1;
