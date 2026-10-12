import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const repo=path.resolve('../..');
const evidence=path.join(repo,'docs/verification/plugin-responsive-boundary');
const delivered=path.join(repo,'docs/verification/creator-host-ui-delivery/business-closure/generated-source-diff/B');
const base=process.env.RESPONSIVE_HOST_ROOT ?? '/tmp/plugin-responsive-repair-hosts';
let server:ViteDevServer;
const hashes=async(root:string)=>Object.fromEntries(await Promise.all(['index.tsx','styles.css','definition.ts','manifest.json'].map(async file=>[file,createHash('sha256').update(await readFile(path.join(root,'src/agent-ui/plugins/business-notes',file))).digest('hex')])));
const measure=async(plugin:any)=>plugin.evaluate((root:HTMLElement)=>{
 const metrics=(el:HTMLElement)=>{
  const css=getComputedStyle(el),rect=el.getBoundingClientRect();
  const range=document.createRange();range.selectNodeContents(el);
  const textRects=[...range.getClientRects()].map(r=>({x:r.x,right:r.right,width:r.width}));
  const clipping=[];for(let n=el.parentElement;n;n=n.parentElement){const s=getComputedStyle(n);if(['hidden','clip','auto','scroll'].includes(s.overflowX)){const r=n.getBoundingClientRect();clipping.push({x:r.x,right:r.right,overflow:s.overflowX});}}
  return {rect:rect.toJSON(),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,textRects,clipping,
   css:Object.fromEntries(['width','max-width','padding','box-sizing','min-width','overflow','overflow-x','overflow-wrap','word-break','white-space'].map(k=>[k,css.getPropertyValue(k)]))};
 };
 const nodes:any={root,parent:root.parentElement,title:root.querySelector('.business-notes-title'),input:root.querySelector('input'),add:root.querySelector('.business-notes-input-row button'),help:root.querySelector('.business-notes-header button'),list:root.querySelector('.business-notes-list')};
 root.querySelectorAll('.ant-list-item,.business-notes-item-text').forEach((el,i)=>nodes['item'+i]=el);
 return Object.fromEntries(Object.entries(nodes).filter(([,el])=>el).map(([key,el])=>[key,metrics(el as HTMLElement)]));
});
function violations(layout:any){
 const errors:string[]=[];
 for(const key of ['root','parent','list'])if(layout[key].scrollWidth>layout[key].clientWidth)errors.push(`${key}: scrollWidth ${layout[key].scrollWidth} > clientWidth ${layout[key].clientWidth}`);
 for(const [key,item] of Object.entries(layout) as [string,any][]){
  if(item.rect.x < -1 || item.rect.right > 421)errors.push(`${key}: outside viewport`);
  for(const clip of item.clipping)if(item.rect.x<clip.x-1||item.rect.right>clip.right+1)errors.push(`${key}: clipped by ancestor`);
  if(key==='title'||key.startsWith('item'))for(const text of item.textRects){if(text.x<item.rect.x-1||text.right>item.rect.right+1)errors.push(`${key}: text overflow`);}
 }
 return errors;
}
for(const stage of ['before','after'])for(const theme of ['light','dark'])for(const locale of ['zh-CN','en-US'])test(`${stage} B 420 ${theme} ${locale}`,async({page})=>{
 const root=path.join(base,stage);
 const sourceHashes=await hashes(root),originalHashes=await hashes(delivered);
 for(const file of ['index.tsx','definition.ts','manifest.json'])expect(sourceHashes[file]).toBe(originalHashes[file]);
 if(stage==='before')expect(sourceHashes).toEqual(originalHashes);
 const out=path.join(evidence,stage);await mkdir(out,{recursive:true});
 server=await createServer({root,cacheDir:root+'/.vite',resolve:{dedupe:['react','react-dom']},server:{hmr:false,port:0,host:'127.0.0.1',fs:{allow:[repo,'/private/tmp','/tmp','/Users/yifei/.codex/visualizations']}}});await server.listen();
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const source=await readFile(path.join(root,'src/agent-ui/agent-ui/i18n/locales',locale+'.ts'),'utf8');
 const block=source.match(/businessNotes\s*:\s*\{([\s\S]*?)\n\s*\}/)![1];
 const labels=Object.fromEntries([...block.matchAll(/(\w+)\s*:\s*("(?:\\.|[^"\\])*")/g)].map(m=>[m[1],JSON.parse(m[2])]));
 const row:any={stage,theme,locale,viewport:420,sourceHashes,errors,states:{},status:'FAIL'};
 try{
  await page.goto(server.resolvedUrls!.local[0]);await page.locator('.acme-host').waitFor();await page.locator('select').first().selectOption(locale);
  if(theme==='dark')await page.locator('.acme-host > .ant-card button').first().click();
  await expect(page.locator('.acme-host')).toHaveAttribute('data-theme',theme);
  await page.locator('.agent-ui-sidebar-frame').waitFor();const sheet=page.locator('.agent-ui-sidebar-sheet');if(await sheet.isVisible())await sheet.getByRole('button',{name:locale==='zh-CN'?'关闭':'Close',exact:true}).click();
  const manifest=JSON.parse(await readFile(path.join(root,'src/agent-ui/plugins/business-notes/manifest.json'),'utf8'));
  const nav=page.getByRole('button',{name:manifest.sidebar.labels[locale],exact:true}).first();await nav.waitFor({state:'attached'});
  if(!await nav.isVisible())await page.getByRole('button',{name:locale==='zh-CN'?'切换侧边栏':'Toggle Sidebar',exact:true}).first().click();await nav.click();
  const plugin=page.locator('[data-ui-plugin=business-notes]');await expect(plugin).toBeVisible();
  // Sidebar entry has a CSS transition. Sample settled layout, never its offscreen entrance.
  await page.waitForTimeout(350);
  await expect.poll(()=>plugin.evaluate(el=>{let active=0;for(let n:Element|null=el;n;n=n.parentElement)active+=n.getAnimations().filter(a=>a.playState==='running').length;return active;})).toBe(0);
  const capture=async(name:string)=>{row.states[name]=await measure(plugin);};
  await capture('initial');
  const input=plugin.getByRole('textbox'),add=plugin.getByRole('button',{name:labels.add,exact:true});
  await expect(add).toBeDisabled();await input.fill('   ');await input.press('Enter');await expect(add).toBeDisabled();
  await input.fill('Acceptance note one');await add.click();await expect(input).toHaveValue('');await input.fill('Acceptance note two');await input.press('Enter');await capture('notes');
  await page.screenshot({path:path.join(out,`${theme}-${locale}-panel.png`),fullPage:true});
  const help=plugin.getByRole('button',{name:labels.openHelp,exact:true});await help.click();const dialog=page.locator('.ant-modal[role=dialog]');await expect(dialog).toBeVisible();await page.waitForTimeout(500);
  row.modal=await dialog.evaluate(el=>{const s=getComputedStyle(el);return{rect:el.getBoundingClientRect().toJSON(),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,css:Object.fromEntries(['width','max-width','padding','box-sizing','min-width','overflow'].map(k=>[k,s.getPropertyValue(k)])),bodyPortal:!el.closest('[data-agent-ui-root]')};});
  row.modalContents=await dialog.locator('button, .ant-typography').evaluateAll(elements=>elements.map(el=>{const range=document.createRange();range.selectNodeContents(el);return {rect:el.getBoundingClientRect().toJSON(),textRects:[...range.getClientRects()].map(r=>({x:r.x,right:r.right}))};}));
  for(const item of row.modalContents){expect(item.rect.x).toBeGreaterThanOrEqual(0);expect(item.rect.right).toBeLessThanOrEqual(420);for(const text of item.textRects){expect(text.x).toBeGreaterThanOrEqual(item.rect.x-1);expect(text.right).toBeLessThanOrEqual(item.rect.right+1);}}
  expect(row.modal.rect.x).toBeGreaterThanOrEqual(0);expect(row.modal.rect.right).toBeLessThanOrEqual(420);expect(row.modal.scrollWidth).toBeLessThanOrEqual(row.modal.clientWidth);
  await page.screenshot({path:path.join(out,`${theme}-${locale}-modal.png`),fullPage:true});
  await expect.poll(()=>dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);await page.keyboard.press('Tab');await expect.poll(()=>dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);await page.keyboard.press('Shift+Tab');await expect.poll(()=>dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(help).toBeFocused();
  await help.click();await dialog.getByRole('button',{name:labels.close,exact:true}).click();await expect(dialog).toBeHidden();await expect(help).toBeFocused();await capture('afterModal');
  const long='LongContent'.repeat(40);await input.fill(long);await input.press('Enter');await plugin.getByText(long,{exact:true}).scrollIntoViewIfNeeded();await capture('longContent');
  await page.screenshot({path:path.join(out,`${theme}-${locale}-long.png`),fullPage:true});
  row.violations=Object.fromEntries(Object.entries(row.states).map(([name,layout])=>[name,violations(layout)]));
  if(stage==='before'){
   for(const layout of Object.values(row.states) as any[])expect(layout.parent.scrollWidth).toBeGreaterThan(layout.parent.clientWidth);
   row.status='EXPECTED_RESPONSIVE_FAIL';
  }else{
   for(const [state,issues] of Object.entries(row.violations))expect(issues, state).toEqual([]);
   for(const layout of Object.values(row.states) as any[]){expect(layout.root.css['box-sizing']).toBe('border-box');expect(layout.root.css['min-width']).toBe('0px');}
   row.status='PASS';
  }
  row.document=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
  expect(row.document.scrollWidth).toBeLessThanOrEqual(row.document.clientWidth);
  expect(errors).toEqual([]);expect(await hashes(root)).toEqual(sourceHashes);
 }finally{await writeFile(path.join(out,`${theme}-${locale}-computed.json`),JSON.stringify(row,null,2));await server.close();}
});
