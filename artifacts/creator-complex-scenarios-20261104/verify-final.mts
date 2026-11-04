import {readFile,writeFile,readdir,lstat,unlink,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createConnectionHostFixture} from './connection-host.mts';
import {verifyScenario} from './verify-scenario.mts';
const repo=fileURLToPath(new URL('../../',import.meta.url)),base=path.dirname(fileURLToPath(import.meta.url));
const id=process.argv[2],entry=JSON.parse(await readFile(path.join(base,'questions.json'),'utf8')).find((value:any)=>value.id===id);
if(!entry)throw Error('Unknown scenario');
const dir=path.join(base,id,'natural'),root=path.join(dir,'host');
async function hashes(dir:string):Promise<any>{const result:any={};for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())Object.assign(result,await hashes(file));else if(entry.isFile())result[path.relative(root,file).split(path.sep).join('/')]=createHash('sha256').update(await readFile(file)).digest('hex');}return result;}
const before=await hashes(path.join(root,'src/agent-ui'));
const roots:any={};for(const name of ['core','renderer','runtime','plugins','web-component'])roots['@za38.03/agent-ui-'+name]=path.join(repo,'artifacts/creator-capability-plan-20261103/frozen',name);
roots['@za38.03/agent-ui-creator']=entry.creatorDistribution?path.resolve(repo,entry.creatorDistribution):path.join(repo,'artifacts/creator-reasoning-roundtrip-20261104/run1/frozen/creator');
try{
 const isolated=JSON.parse(await readFile(path.join(base,'isolated-distribution.json'),'utf8'));Object.assign(roots,isolated.packageRoots);
 for(const [name,target]of Object.entries(roots)){
  const link=path.join(root,'node_modules',name);const current=await lstat(link).catch(()=>undefined);if(!current)continue;if(!current.isSymbolicLink())throw Error('Expected isolated fixture dependency link');await unlink(link);await symlink(target as string,link,process.platform==='win32'?'junction':'dir');
 }
}catch(error:any){if(error.code!=='ENOENT')throw error;}
const {chromium}=createRequire(path.join(repo,'apps/creator-workbench/package.json'))('@playwright/test');
const browser=await chromium.launch({headless:true});let fixture:any;
try{
 fixture=await createConnectionHostFixture({existingHostRoot:root,packageRoots:roots});fixture.enableCors();
 await writeFile(path.join(root,'src/main.tsx'),'import {createRoot} from "react-dom/client";import {Agent} from "./agent-ui";import "./host.css";createRoot(document.getElementById("root")!).render(<Agent endpoint={'+JSON.stringify(fixture.agentEndpoint)+'}/>);');fixture.refreshHostEntry();
 const page=await browser.newPage({viewport:{width:1680,height:1050}});await page.context().grantPermissions(['clipboard-read','clipboard-write']);const browserErrors:string[]=[],consoleErrors:string[]=[],httpRequests:any[]=[];page.on('pageerror',error=>browserErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});page.on('request',request=>{if(request.method()==='POST')httpRequests.push({url:request.url()});});
 await page.goto(fixture.hostOrigin);await page.locator('.aui-composer-root').getByRole('textbox').waitFor({state:'visible'});
 const result=await verifyScenario({caseId:entry.verificationId??id,testCase:entry,page,frame:page,fixture,dir});
 const after=await hashes(path.join(root,'src/agent-ui'));
 const output={...result,caseId:id,scope:'Independent standalone Host browser verification after native Creator run; no Agent UI implementation edits.',httpRequests,browserErrors,consoleErrors,agentUiHashesUnchanged:JSON.stringify(Object.entries(before).sort())===JSON.stringify(Object.entries(after).sort())};
 if(browserErrors.length||consoleErrors.length)output.status='failed';
 await writeFile(path.join(dir,'external-verification.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output));
}finally{await browser.close();if(fixture)await fixture.close();}
