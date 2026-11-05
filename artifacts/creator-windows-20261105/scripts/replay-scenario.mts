import {cp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createConnectionHostFixture} from './connection-host.mts';
import {verifyScenario} from './verify-scenario.mts';
import {spawnPnpmSync} from '../../../scripts/pnpm-process.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const artifactRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=path.join(artifactRoot,'local-runs');
const pointer=process.argv[2]??'case08-progress-262k';
const sourceRun=process.env.AGENT_UI_QA_SOURCE_RUN;
const latest=sourceRun
 ?{out:path.resolve(sourceRun),result:JSON.parse(await readFile(path.resolve(sourceRun,'result.json'),'utf8'))}
 :JSON.parse(await readFile(new URL('../latest-'+pointer+'.json',import.meta.url),'utf8'));
latest.out=path.resolve(artifactRoot,latest.out);
const caseId=latest.result.caseId;
const testCase=JSON.parse(await readFile(path.join(repo,'artifacts/creator-complex-scenarios-20261104/questions.json'),'utf8')).find((item:any)=>item.id===caseId);
const out=path.join(base,pointer+'-replay');await mkdir(out,{recursive:true});
const json=async(file:string,value:any)=>writeFile(file,JSON.stringify(value,null,2));
async function hashes(root:string,dir=path.join(root,'src/agent-ui')):Promise<Record<string,string>>{const result:Record<string,string>={};for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())Object.assign(result,await hashes(root,file));else if(entry.isFile())result[path.relative(path.join(root,'src/agent-ui'),file).split(path.sep).join('/')]=createHash('sha256').update(await readFile(file)).digest('hex');}return result;}
const originalHashes=await hashes(path.join(latest.out,'host'));
if(process.argv.includes('--check')){
 if(!testCase)throw Error('Archived scenario question is unavailable');
 console.log(JSON.stringify({status:'passed',caseId,archivedSourceFiles:Object.keys(originalHashes).length,scope:'Portable imports and archived source paths only; no model or browser run.'}));
}else{
const {chromium}=createRequire(path.join(repo,'apps/creator-workbench/package.json'))('@playwright/test');
let fixture:any,browser:any;const result:any={scope:'Independent replay of unchanged model-generated source. No new model call or source repair. Creator preview explicitly connected to the controlled AG-UI test endpoint through the existing connection API.',source:latest.out};
try{
 fixture=await createConnectionHostFixture({projectChecks:true,packageSnapshotFile:path.join(out,'package-snapshot.json'),prepareHost:async(root:string)=>{await cp(path.join(latest.out,'host/src/agent-ui'),path.join(root,'src/agent-ui'),{recursive:true});}});
 fixture.enableCors();
 await writeFile(path.join(fixture.hostRoot,'src/main.tsx'),'import {createRoot} from "react-dom/client";import {Agent} from "./agent-ui";import "./host.css";createRoot(document.getElementById("root")!).render(<Agent endpoint={'+JSON.stringify(fixture.agentEndpoint)+'}/>);');
 fixture.refreshHostEntry();
 const response=await fetch(fixture.creatorOrigin.replace(/\/$/,'')+'/__agent-ui/creator/connection',{method:'POST',headers:{'Content-Type':'application/json','X-Agent-UI-Workspace-Id':fixture.workspaceId},body:JSON.stringify({activeSource:'connected',enabled:true,connectionMode:'direct',endpoint:fixture.agentEndpoint})});
 if(!response.ok)throw Error('Controlled connection setup failed: '+response.status);
 result.connection=await response.json();
 result.staticChecks=[];
 for(const script of ['typecheck','build']){
  const checked=spawnPnpmSync([script],{cwd:fixture.hostRoot,encoding:'utf8',maxBuffer:4_000_000,timeout:120_000});
  await writeFile(path.join(out,script+'.log'),String(checked.stdout??'')+String(checked.stderr??''));
  result.staticChecks.push({script,status:checked.status===0?'passed':'failed',exitCode:checked.status,error:checked.error?.message});
 }
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1680,height:1050}});await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 result.browserErrors=[];page.on('pageerror',(error:any)=>result.browserErrors.push(error.message));
 await page.goto(fixture.creatorOrigin);
 const frame=page.frameLocator('iframe[title="Host Application"]');
 await frame.locator('.aui-composer-root').getByRole('textbox').waitFor({state:'visible',timeout:45000});
 result.interaction=await verifyScenario({caseId,testCase,page,frame,fixture,dir:out});
 result.controlledAgentRuns=fixture.runCount();
 const afterHashes=await hashes(fixture.hostRoot);result.sourceDifferences=[...new Set([...Object.keys(originalHashes),...Object.keys(afterHashes)])].filter(file=>originalHashes[file]!==afterHashes[file]);result.sourceUnchanged=result.sourceDifferences.length===0;
 await json(path.join(out,'result.json'),result);
 if(result.staticChecks.some((check:any)=>check.status!=='passed')||result.interaction.status!=='passed'||result.browserErrors.length||!result.sourceUnchanged)process.exitCode=1;
 console.log(JSON.stringify({staticChecks:result.staticChecks,interaction:result.interaction.status,checks:result.interaction.checks,controlledAgentRuns:result.controlledAgentRuns,sourceUnchanged:result.sourceUnchanged,browserErrors:result.browserErrors}));
}catch(error:any){result.error=error.message;await json(path.join(out,'result.json'),result);console.log(JSON.stringify({error:error.message}));process.exitCode=1;}
finally{
 await browser?.close();
 try{await fixture?.close();await json(path.join(out,'cleanup.json'),{closed:true,at:new Date().toISOString()});}
 catch(error:any){await json(path.join(out,'cleanup.json'),{complete:false,code:error.code,syscall:error.syscall,message:error.message,at:new Date().toISOString()});process.exitCode=1;}
}
}
