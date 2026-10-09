const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const {chromium,expect}=require(path.resolve(__dirname,'../../../..','apps/creator-workbench/node_modules/@playwright/test'));
const base=process.env.CREATOR_ACCEPTANCE_OUTPUT;
const scenario=process.env.CREATOR_SCENARIO||'B';
const root=path.join(base,scenario), out=path.join(base,'visual');fs.mkdirSync(out,{recursive:true});
const labelsFor=locale=>{
 const source=fs.readFileSync(path.join(root,'src/agent-ui/agent-ui/i18n/locales',locale+'.ts'),'utf8');
 const block=source.match(/businessNotes\s*:\s*\{([\s\S]*?)\n\s*\}/);
 if(!block)throw Error('Missing actual businessNotes locale namespace');
 const labels=Object.fromEntries([...block[1].matchAll(/(\w+)\s*:\s*("(?:\\.|[^"\\])*")/g)].map(m=>[m[1],JSON.parse(m[2])]));return {...labels,add:labels.add??labels.addNote,empty:labels.empty??labels.emptyState??labels.emptyTitle,close:labels.close??labels.closeHelp,openHelp:labels.openHelp??labels.help};
};
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
 for(const width of [1440,420])for(const theme of ['light','dark'])for(const locale of ['zh-CN','en-US']){
  const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const hashSources=()=>Object.fromEntries(['index.tsx','styles.css','manifest.json','definition.ts'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/agent-ui/plugins/business-notes',f))).digest('hex')]));const row={scenario,width,theme,locale,errors,status:'FAIL',sourceHashes:hashSources()};
  try{
   const labels=labelsFor(locale);await page.goto(`http://127.0.0.1:${process.env.CREATOR_PORT||5392}/`);
   await page.locator('.acme-host').waitFor();await page.locator('select').first().selectOption(locale);
   if(theme==='dark')await page.locator('.acme-host > .ant-card button, .acme-host > .acme-card button').first().click();
   await expect(page.locator('.acme-host')).toHaveAttribute('data-theme',theme);
   const manifest=JSON.parse(fs.readFileSync(path.join(root,'src/agent-ui/plugins/business-notes/manifest.json'),'utf8'));
   await page.locator('.agent-ui-sidebar-frame').waitFor();const initialSheet=page.locator('.agent-ui-sidebar-sheet');if(await initialSheet.isVisible())await initialSheet.getByRole('button',{name:locale==='zh-CN'?'关闭':'Close',exact:true}).click();
   const nav=page.getByRole('button',{name:manifest.sidebar.labels[locale],exact:true}).first();
   await nav.waitFor({state:'attached'});if(!await nav.isVisible())await page.getByRole('button',{name:locale==='zh-CN'?'切换侧边栏':'Toggle Sidebar',exact:true}).first().click();
   const composer=page.locator('[contenteditable="true"]').first();const composerStyle=async()=>composer.count()?composer.evaluate(el=>{const s=getComputedStyle(el);return{font:s.fontFamily,color:s.color,background:s.backgroundColor}}):null;const composerBefore=await composerStyle();
   await nav.click();const plugin=page.locator('[data-ui-plugin="business-notes"]');await expect(plugin).toBeVisible();row.pluginVisible=true;
   const input=plugin.getByRole('textbox'),add=plugin.getByRole('button',{name:labels.add,exact:true});
   await expect(plugin.getByText(labels.empty,{exact:true})).toBeVisible();if(await add.isDisabled())await expect(add).toBeDisabled();
   await input.fill('   ');await input.press('Enter');if(await add.isDisabled())await expect(add).toBeDisabled();await expect(plugin.getByText(labels.empty,{exact:true})).toBeVisible();
   await input.fill('Acceptance note one');await add.click();await expect(plugin.getByText('Acceptance note one',{exact:true})).toBeVisible();await expect(input).toHaveValue('');
   await input.fill('Acceptance note two');await input.press('Enter');await expect(plugin.getByText('Acceptance note two',{exact:true})).toBeVisible();
   await plugin.getByText('Acceptance note two',{exact:true}).scrollIntoViewIfNeeded();row.panelScreenshot=`${scenario}-${width}-${theme}-${locale}-panel.png`;await page.screenshot({path:path.join(out,row.panelScreenshot),fullPage:true});
   const help=plugin.getByRole('button',{name:labels.openHelp,exact:true});await help.click();
   const dialog=page.locator('.ant-modal[role="dialog"], dialog[aria-labelledby="business-notes-help-title"]');await expect(dialog).toBeVisible();await expect(dialog.getByText(labels.helpTitle,{exact:true})).toBeVisible();
   await expect(dialog.getByRole('button',{name:labels.close,exact:true}).first()).toBeVisible();
   row.dialogRect=await dialog.boundingBox();if(row.dialogRect.x<0||row.dialogRect.x+row.dialogRect.width>width+1)throw Error('Modal outside viewport');
   const screenshot=`${scenario}-${width}-${theme}-${locale}.png`;await page.screenshot({path:path.join(out,screenshot),fullPage:true});row.screenshot=screenshot;
   await expect.poll(()=>dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);await page.keyboard.press('Tab');await expect.poll(()=>dialog.evaluate(el=>el.contains(document.activeElement)||(el.tagName==='DIALOG'&&el.open&&document.activeElement===document.body))).toBe(true);row.nativeChromeFocus=await dialog.evaluate(el=>el.tagName==='DIALOG'&&document.activeElement===document.body);await page.keyboard.press('Shift+Tab');await expect.poll(()=>dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);if(scenario!=='B'){await input.evaluate(el=>el.focus());await expect(input).not.toBeFocused();}await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(help).toBeFocused();
   await help.click();await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:labels.close,exact:true}).first().click();await expect(dialog).toBeHidden();await expect(help).toBeFocused();
   await expect(plugin.getByText('Acceptance note two',{exact:true})).toBeVisible();row.pluginRect=await plugin.boundingBox();if(row.pluginRect.x<0||row.pluginRect.x+row.pluginRect.width>width+1)throw Error('Plugin outside viewport');
   row.controlRects={};for(const [name,control] of [['input',input],['add',add],['help',help]]){const rect=await control.boundingBox();row.controlRects[name]=rect;if(rect.x<row.pluginRect.x-1||rect.x+rect.width>row.pluginRect.x+row.pluginRect.width+1)throw Error('Control exceeds Plugin panel: '+name);}
   row.controls=await input.evaluate(el=>{const s=getComputedStyle(el);return{className:el.className,color:s.color,background:s.backgroundColor,font:s.fontFamily,border:s.borderColor}});
   row.hostControls=await page.locator('.acme-host > .ant-card input, .acme-host > .acme-card input').first().evaluate(el=>{const s=getComputedStyle(el);return{className:el.className,color:s.color,background:s.backgroundColor,font:s.fontFamily,border:s.borderColor}});for(const k of ['color','background','font','border'])if(row.controls[k]!==row.hostControls[k])throw Error('Host theme mismatch: '+k);
   row.composerBefore=composerBefore;row.composerAfter=await composerStyle();if(JSON.stringify(row.composerBefore)!==JSON.stringify(row.composerAfter))throw Error('Composer presentation changed after plugin interaction');
   if(scenario==='B'&&!row.controls.className.includes('ant-input'))throw Error('Generated input does not use Antd');
   if(scenario!=='B'&&!row.controls.className.includes('acme-input'))throw Error('Generated input does not use active Design System');
   if(JSON.stringify(row.sourceHashes)!==JSON.stringify(hashSources()))throw Error('Source changed during browser acceptance');
   if(errors.length)throw Error(errors.join('; '));row.status='PASS';
  }catch(error){row.error=error.message;await page.screenshot({path:path.join(out,`${scenario}-${width}-${theme}-${locale}-failure.png`),fullPage:true}).catch(()=>{});}
  results.push(row);await page.close();
 }
 await browser.close();fs.writeFileSync(path.join(out,scenario+'-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({width,theme,locale,status,error})=>({width,theme,locale,status,error}))));
 if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1});
