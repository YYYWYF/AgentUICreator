// Reuse the original Creator B acceptance actions and source; add measurements.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const repo = process.cwd();
const out = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(repo + '/apps/creator-workbench/package.json');
const { createServer } = await import(require.resolve('vite'));
let code = await readFile(repo + '/docs/verification/creator-host-ui-delivery/business-closure/browser-acceptance.cjs', 'utf8');
code = code.replace("path.resolve(__dirname,'../../../..','apps/creator-workbench/node_modules/@playwright/test')", JSON.stringify(require.resolve('@playwright/test')));
code = code.replace('for(const width of [1440,420])', 'for(const width of [420])');
code = code.replace("out=path.join(base,'visual')", 'out=process.env.RESPONSIVE_OUTPUT');
code = code.replace('(async()=>{', `
const layout = async (plugin) => plugin.evaluate(root => {
 const measure = el => { const css=getComputedStyle(el);return {
  rect:el.getBoundingClientRect().toJSON(),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,
  css:Object.fromEntries(['width','padding','box-sizing','min-width','max-width','overflow','overflow-x','overflow-wrap','word-break'].map(k=>[k,css.getPropertyValue(k)])),
 }; };
 const nodes={root,parent:root.parentElement,title:root.querySelector('.business-notes-title'),input:root.querySelector('input'),button:root.querySelector('.business-notes-input-row button'),list:root.querySelector('.business-notes-list'),listItem:root.querySelector('.ant-list-item')};
 return Object.fromEntries(Object.entries(nodes).map(([key,el])=>[key,el?measure(el):null]));
});
(async()=>{`);
code = code.replace('row.pluginVisible=true;', 'row.pluginVisible=true;row.layoutInitial=await layout(plugin);');
code = code.replace("const help=plugin.getByRole('button'", "row.layoutAfterNotes=await layout(plugin);const help=plugin.getByRole('button'");
code = code.replace('row.dialogRect=await dialog.boundingBox();', `await page.waitForTimeout(500);row.dialogRect=await dialog.boundingBox();row.modalLayout=await dialog.evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,opacity:getComputedStyle(el).opacity,overflow:getComputedStyle(el).overflow,bodyPortal:!el.closest('[data-agent-ui-root]')}));`);
code = code.replace("row.pluginRect=await plugin.boundingBox();", `row.layoutAfterModal=await layout(plugin);
   await input.fill('LongContent'.repeat(40));await input.press('Enter');await plugin.getByText('LongContent'.repeat(40),{exact:true}).scrollIntoViewIfNeeded();row.layoutLongContent=await layout(plugin);row.pluginRect=await plugin.boundingBox();`);
code = code.replace("row.status='PASS';", `const measured=row.layoutAfterModal;
   if(measured.root.css['box-sizing']!=='border-box'||measured.root.css['min-width']!=='0px')throw Error('Root does not satisfy border-box / min-width:0');
   if(measured.root.scrollWidth>measured.root.clientWidth||measured.parent.scrollWidth>measured.parent.clientWidth)throw Error('Plugin or parent scrollWidth exceeds clientWidth');
   row.status='PASS';`);
code = code.replace("['width','height','padding','box-sizing','overflow','font-size','line-height']", "['width','height','padding','box-sizing','min-width','max-width','overflow','font-size','line-height']");
await mkdir(out + '/responsive', {recursive:true});
const script = out + '/responsive/runner.cjs';
await writeFile(script, code);
const root='/tmp/plugin-style-final-hosts/B';
const server=await createServer({root,cacheDir:root+'/.vite',resolve:{dedupe:['react','react-dom']},server:{hmr:false,port:0,host:'127.0.0.1',fs:{allow:[repo,'/private/tmp']}}});
await server.listen();
try {
 const result=await new Promise((resolve,reject)=>{
  const child=spawn('node',[script],{stdio:'inherit',env:{...process.env,CREATOR_ACCEPTANCE_OUTPUT:'/tmp/plugin-style-final-hosts',CREATOR_SCENARIO:'B',CREATOR_PORT:new URL(server.resolvedUrls.local[0]).port,RESPONSIVE_OUTPUT:out+'/responsive'}});
  child.on('error',reject);child.on('close',resolve);
 });
 process.exitCode=result;
} finally {await server.close();}
