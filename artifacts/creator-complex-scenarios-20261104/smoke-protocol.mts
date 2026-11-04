import {cp,mkdir,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createConnectionHostFixture} from './connection-host.mts';
const repo=fileURLToPath(new URL('../../',import.meta.url)),base=path.dirname(fileURLToPath(import.meta.url));
const source=path.join(repo,'artifacts/creator-reasoning-roundtrip-20261104/run1/natural/host'),root=path.join(base,'protocol-smoke/host');
await rm(root,{recursive:true,force:true});await mkdir(root,{recursive:true});
for(const name of ['src','package.json','index.html','tsconfig.json'])await cp(path.join(source,name),path.join(root,name),{recursive:true});
await symlink(path.join(source,'node_modules'),path.join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
const roots:any={};for(const name of ['core','renderer','runtime','plugins','web-component'])roots['@za38.03/agent-ui-'+name]=path.join(repo,'artifacts/creator-capability-plan-20261103/frozen',name);
roots['@za38.03/agent-ui-creator']=path.join(repo,'artifacts/creator-reasoning-roundtrip-20261104/run1/frozen/creator');
const {chromium,expect}=createRequire(path.join(repo,'apps/creator-workbench/package.json'))('@playwright/test');
const browser=await chromium.launch({headless:true});let fixture:any;let page:any;const traffic:any[]=[];
try{
 fixture=await createConnectionHostFixture({existingHostRoot:root,packageRoots:roots});fixture.enableCors();
 await writeFile(path.join(root,'src/main.tsx'),'import {createRoot} from "react-dom/client";import {Agent} from "./agent-ui";import "./host.css";createRoot(document.getElementById("root")!).render(<Agent endpoint={'+JSON.stringify(fixture.agentEndpoint)+'}/>);');
 page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',(error:any)=>errors.push(error.message));page.on('request',(request:any)=>{if(request.method()==='POST')traffic.push({url:request.url(),method:request.method()});});page.on('console',(message:any)=>{if(message.type()==='error')traffic.push({console:message.text()});});
 await page.goto(fixture.hostOrigin);await page.locator('.aui-composer-root').getByRole('textbox').fill('协议通路检查');await page.locator('.aui-composer-send').click();
 await expect.poll(()=>fixture.runCount()).toBe(1);
 const value=JSON.parse(await readFile(path.join(repo,'packages/creator/src/mock-agent/builtins/context-retrieval-sample.json'),'utf8'));
 fixture.emitEvents([{type:'CUSTOM',name:'CONTEXT_CONTENT',value}]);fixture.finishRun();
 await expect(page.locator('.agent-ui-context-retrieval-message')).toBeVisible({timeout:12000});await expect(page.getByText('wire:finished',{exact:false})).toBeVisible();expect(errors).toEqual([]);expect(traffic.filter(row=>row.console)).toEqual([]);
 await page.screenshot({path:path.join(base,'protocol-smoke/verified.png'),fullPage:true});
 await writeFile(path.join(base,'protocol-smoke/result.json'),JSON.stringify({status:'passed',path:'HTTP SSE -> AG-UI client -> existing named Data Message UI -> DOM',customEvent:'CONTEXT_CONTENT',errors},null,2));
 console.log('Protocol SSE smoke passed');
}finally{if(page){await writeFile(path.join(base,'protocol-smoke/traffic.json'),JSON.stringify({traffic,body:await page.locator('body').innerText()},null,2));await page.screenshot({path:path.join(base,'protocol-smoke/final.png'),fullPage:true});}await browser.close();if(fixture)await fixture.close();}
