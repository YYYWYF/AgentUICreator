import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnectionHostFixture } from './connection-host.mts';
import { hostEnvironment } from '../../../packages/creator/src/agent/config.ts';
import { verifyScenario } from './verify-scenario.mts';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../local-runs');
const caseId=process.argv[2]??'case07-sales';
const testCase=JSON.parse(await readFile(path.join(repo,'artifacts/creator-complex-scenarios-20261104/questions.json'),'utf8')).find((entry:any)=>entry.id===caseId);
if(!testCase)throw Error('Unknown case');
const label=process.argv[3]??'baseline';
const pointer=path.join(base,'latest-'+caseId+(process.env.AGENT_UI_QA_POINTER_SUFFIX??'')+'.json');
const out=path.join(base,caseId+'-'+label+'-'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(out,{recursive:true});
const json=async(file:string,value:any)=>writeFile(file,JSON.stringify(value,null,2));
const digest=(value:any)=>createHash('sha256').update(value).digest('hex');
const scenarioPrompt=testCase.prompt+(testCase.event?'\n\n'+JSON.stringify(testCase.event,null,2):'')+(testCase.failureExample?'\n\n失败时的 error 示例：\n'+JSON.stringify(testCase.failureExample,null,2):'');
const promptFile=process.env.AGENT_UI_QA_PROMPT_FILE;
const original=promptFile?await readFile(path.resolve(promptFile),'utf8'):scenarioPrompt;
const seedSource=process.env.AGENT_UI_QA_SOURCE_RUN
 ?path.resolve(process.env.AGENT_UI_QA_SOURCE_RUN,'host/src/agent-ui')
 :path.join(repo,'artifacts/creator-reasoning-roundtrip-20261104/run1/natural/host/src/agent-ui');
const seedAfterStartup=process.env.AGENT_UI_QA_SEED_AFTER_STARTUP==='1';
const require=createRequire(path.join(repo,'apps/creator-workbench/package.json'));
const {chromium}=require('@playwright/test');
const env=hostEnvironment(repo);
const upstream=new URL(env.CREATOR_MODEL_BASE_URL!);
const requests:any[]=[];
const relay=createServer(async(req,res)=>{
 const controller=new AbortController();
 res.on('close',()=>{if(!res.writableEnded)controller.abort();});
 const meta:any={started:new Date().toISOString()};
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=Buffer.concat(chunks),parsed=JSON.parse(body.toString());
  Object.assign(meta,{model:parsed.model,max_tokens:parsed.max_tokens,toolCount:parsed.tools?.length??0,requestToolNames:(parsed.tools??[]).map((item:any)=>item.function?.name),purpose:parsed.tools?.length?'agent':JSON.stringify(parsed.messages).includes('Summarize this Creator coding task')?'summary':'routing',assistantContinuation:(parsed.messages??[]).filter((message:any)=>message.role==='assistant').map((message:any)=>({hasReasoningField:Object.hasOwn(message,'reasoning_content'),reasoningCharacters:typeof message.reasoning_content==='string'?message.reasoning_content.length:null,toolCalls:message.tool_calls?.length??0})),responseToolCalls:[],contentCharacters:0,reasoningCharacters:0});
  meta.hostContext=(parsed.messages??[]).filter((message:any)=>typeof message.content==='string'&&message.content.startsWith('Host ')).map((message:any)=>({kind:message.content.split('\n')[0],characters:message.content.length,sha256:digest(message.content)}));
  meta.hostSourceState=(parsed.messages??[]).filter((message:any)=>typeof message.content==='string'&&message.content.startsWith('Host same-run source observations')).flatMap((message:any)=>{try{return JSON.parse(message.content.slice(message.content.indexOf('\n')+1)).files.map((file:any)=>({path:file.path,hash:file.hash,start:file.start,end:file.end,truncated:file.truncated}));}catch{return [];}});
  requests.push(meta);
  const headers=new Headers();
  for(const [key,value]of Object.entries(req.headers))if(value&&!['host','content-length','connection','transfer-encoding'].includes(key))headers.set(key,Array.isArray(value)?value.join(','):value);
  const response=await fetch(new URL(req.url!,upstream.origin),{method:req.method,headers,body,signal:controller.signal});
  meta.status=response.status;
  res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')??'text/event-stream'});
  const decoder=new TextDecoder();let pending='';
  for await(const chunk of response.body!){
   res.write(chunk);pending+=decoder.decode(chunk,{stream:true});let end;
   while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end).trim();pending=pending.slice(end+1);if(line.startsWith('data: ')&&line!=='data: [DONE]')try{
    const value=JSON.parse(line.slice(6));if(value.usage)meta.usage=value.usage;if(value.model)meta.returnedModel=value.model;
    if(value.error)meta.streamError={code:value.error.code??null,type:value.error.type??null,message:String(value.error.message??'').replaceAll(env.CREATOR_MODEL_API_KEY!,'[REDACTED]').slice(0,1200)};
    for(const choice of value.choices??[]){
     if(choice.finish_reason)meta.finishReason=choice.finish_reason;
     const delta=choice.delta??{};
     if(typeof delta.content==='string')meta.contentCharacters+=delta.content.length;
     if(typeof delta.reasoning_content==='string')meta.reasoningCharacters+=delta.reasoning_content.length;
     for(const call of delta.tool_calls??[]){let info=meta.responseToolCalls.find((item:any)=>item.index===(call.index??0));if(!info){info={index:call.index??0,name:'',argumentCharacters:0};meta.responseToolCalls.push(info);}if(call.id)info.id=call.id;if(call.function?.name)info.name+=call.function.name;if(typeof call.function?.arguments==='string')info.argumentCharacters+=call.function.arguments.length;}
    }
   }catch{}}
  }
  res.end();
 }catch(error:any){meta.error=error.name;meta.code=error.cause?.code;if(!res.headersSent)res.writeHead(502);res.end();}
 finally{meta.seconds=(Date.now()-Date.parse(meta.started))/1000;await json(path.join(out,'model-http-requests.json'),requests);}
});
await new Promise<void>(resolve=>relay.listen(0,'127.0.0.1',resolve));
Object.assign(process.env,env,{CREATOR_MODEL_BASE_URL:`http://127.0.0.1:${(relay.address()as any).port}${upstream.pathname.replace(/\/$/,'')}`,CREATOR_HOT_RELOAD:'0'});
const packageRoots=Object.fromEntries(['core','renderer','runtime','plugins','web-component','creator'].map(name=>['@za38.03/agent-ui-'+name,path.join(repo,'packages',name)]));
const creatorSource=Object.fromEntries(await Promise.all(['prompts.json','activity.ts','files/creatorFileState.ts','runner.ts','model-policy.ts','context-window.ts','evidence-progress.ts','working-context.ts','tools.ts','source-tools.ts'].map(async(file)=>[file,digest(await readFile(path.join(repo,'packages/creator/src/agent',file)))])));
const guidanceSource=Object.fromEntries(await Promise.all(['packages/creator/skills/ag-ui-frontend/SKILL.md','packages/creator/skills/ui-plugin-development/SKILL.md','packages/creator/skills/ui-plugin-development/references/authoring-contracts.md','website/docs/development/plugin-api.md'].map(async(file)=>[file,digest(await readFile(path.join(repo,file)))])));
await json(path.join(out,'environment.json'),{created:new Date().toISOString(),caseId,label,creatorSource,guidanceSource,sourceCreator:process.env.AGENT_UI_TEST_SOURCE_CREATOR==='1',platform:process.platform,node:process.version,model:env.CREATOR_MODEL_NAME,providerFingerprint:digest(upstream.href),context:env.CREATOR_CONTEXT_MAX_TOKENS,keep:env.CREATOR_CONTEXT_KEEP_TOKENS,output:env.CREATOR_MODEL_MAX_TOKENS,summaryOutput:env.CREATOR_CONTEXT_SUMMARY_MAX_TOKENS??'8192 (implementation default)',timeout:env.CREATOR_MODEL_TIMEOUT_SECONDS,opencodeSessionHeader:env.CREATOR_MODEL_OPENCODE_SESSION_HEADER,prompt:original,packageRoots,scope:'Current checkout. Original scenario or explicitly recorded follow-up and seed source (see qa-input.json); freshly built local packages, not historical frozen distributions. Only new-Plugin start decisions are simulated in the disposable QA project. Takeover and dependency-install questions remain unapproved. 1200-second QA observation window; no cumulative Creator call or graph-step cap. Provider output telemetry records tool names and character counts only, never private reasoning text or tool argument bodies.'});
await json(pointer,{out,pid:process.pid,status:'starting'});
await json(path.join(out,'qa-input.json'),{seedSource,seedPhase:seedAfterStartup?'after-ready-running-Creator':'before-workspace-selection',promptFile:promptFile?path.resolve(promptFile):null,scenarioPrompt,prompt:original});

async function hashes(root:string,dir=path.join(root,'src')):Promise<Record<string,string>>{
 const result:Record<string,string>={};
 for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())Object.assign(result,await hashes(root,file));else if(entry.isFile())result[path.relative(root,file).split(path.sep).join('/')]=digest(await readFile(file));}
 return result;
}
let fixture:any,browser:any,page:any,started=0;
const events:any[]=[],browserErrors:string[]=[],qaApprovals:any[]=[];
let timedOut=false;
try{
 fixture=await createConnectionHostFixture({liveModel:true,packageRoots,prepareHost:async(root:string)=>{
  await cp(seedAfterStartup?path.join(repo,'artifacts/creator-reasoning-roundtrip-20261104/run1/natural/host/src/agent-ui'):seedSource,path.join(root,'src/agent-ui'),{recursive:true});
 },...(seedAfterStartup?{afterReadyHost:async(root:string)=>cp(seedSource,path.join(root,'src/agent-ui'),{recursive:true})}:{})});
 fixture.enableCors();
 const previewConnection=await fetch(fixture.creatorOrigin.replace(/\/$/,'')+'/__agent-ui/creator/connection',{method:'POST',headers:{'Content-Type':'application/json','X-Agent-UI-Workspace-Id':fixture.workspaceId},body:JSON.stringify({activeSource:'connected',enabled:true,connectionMode:'direct',endpoint:fixture.agentEndpoint})});
 if(!previewConnection.ok)throw Error('Controlled preview connection setup failed: '+previewConnection.status);
 await json(path.join(out,'preview-connection.json'),await previewConnection.json());
 await writeFile(path.join(fixture.hostRoot,'src/main.tsx'),'import {createRoot} from "react-dom/client";import {Agent} from "./agent-ui";import "./host.css";createRoot(document.getElementById("root")!).render(<Agent endpoint={'+JSON.stringify(fixture.agentEndpoint)+'}/>);');
 fixture.refreshHostEntry();
 const before=await hashes(fixture.hostRoot);
 await json(path.join(out,'before-hashes.json'),before);
 await json(path.join(out,'connection.json'),{creatorOrigin:fixture.creatorOrigin,hostOrigin:fixture.hostOrigin,hostRoot:fixture.hostRoot,agentEndpoint:fixture.agentEndpoint,previewAgentSource:'connected'});
 browser=await chromium.launch({headless:true});
 page=await browser.newPage({viewport:{width:1680,height:1050}});
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 page.on('pageerror',(error:any)=>browserErrors.push(error.message));
 await page.exposeBinding('recordCreatorEvent',(_:any,event:any)=>{
  const row={seconds:(Date.now()-started)/1000,event};events.push(row);
  appendFileSync(path.join(out,'events-timed.jsonl'),JSON.stringify(row)+'\n');
  if(event.type==='TOOL_CALL_START')console.log(JSON.stringify({seconds:row.seconds,toolNumber:events.filter(x=>x.event.type==='TOOL_CALL_START').length,tool:event.toolCallName}));
 });
 await page.addInitScript(()=>{
  const originalFetch=window.fetch;
  window.fetch=async(...args)=>{
   const response=await originalFetch(...args);
   if(String(args[0] instanceof Request?args[0].url:args[0]).includes('/__creator/run')&&response.body){
    const copy=response.clone();
    void(async()=>{const reader=copy.body!.getReader(),decoder=new TextDecoder();let pending='';try{while(true){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(line.startsWith('data: '))try{await(window as any).recordCreatorEvent(JSON.parse(line.slice(6)));}catch{}}}}catch(error){await(window as any).recordCreatorEvent({type:'QA_STREAM_OBSERVER_ERROR',message:String(error)});}})();
   }
   return response;
  };
 });
 await page.goto(fixture.creatorOrigin);
 const frame=page.frameLocator('iframe[title="Host Application"]');
 await frame.locator('.quick-help-card').first().waitFor({state:'visible',timeout:60000});
 await page.screenshot({path:path.join(out,'before.png'),fullPage:true});
 started=Date.now();
 await json(pointer,{out,pid:process.pid,status:'running',started:new Date(started).toISOString(),hostRoot:fixture.hostRoot});
 console.log(JSON.stringify({caseId,out,started:new Date(started).toISOString()}));
 let offset=0;
 await page.locator('#creator-request').fill(original);
 await page.locator('#creator-request').press('Enter');
 while(true){
  while(!events.slice(offset).some(row=>['RUN_FINISHED','RUN_ERROR'].includes(row.event.type))){
   const observerError=events.slice(offset).find(row=>row.event.type==='QA_STREAM_OBSERVER_ERROR');
   if(observerError)throw Error('Creator stream interrupted without a native terminal event: '+observerError.event.message);
   if(Date.now()-started>1200000&&!timedOut){timedOut=true;await page.getByRole('button',{name:/停止|stop/i}).first().click({timeout:5000});}
   if(Date.now()-started>1260000)throw Error('QA cancellation did not finish within 60 seconds');
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  const phase=events.slice(offset).map(row=>row.event);offset=events.length;
  const question=phase.findLast((event:any)=>event.type==='CUSTOM'&&event.name==='on_interrupt');
  const step=question?.value?.metadata?.steps?.[0];
  if(step?.id!=='plugin-development-decision'||timedOut)break;
  const ids=new Set(phase.filter((event:any)=>event.type==='TOOL_CALL_START'&&event.toolCallName==='prepare_ui_plugin_development').map((event:any)=>event.toolCallId));
  const args=phase.filter((event:any)=>event.type==='TOOL_CALL_ARGS'&&ids.has(event.toolCallId)).map((event:any)=>JSON.parse(event.delta));
  const proposal=args.at(-1);
  if(!proposal||proposal.affectedFiles?.some((file:string)=>/(?:^|[\\/])(?:vendor|vendors|upstream|runtime|framework)(?:[\\/]|$)/i.test(file)))throw Error('QA does not approve protected changes');
  const current=await hashes(fixture.hostRoot),prefix='src/agent-ui/plugins/'+proposal.targetPluginId+'/';
  if(Object.keys(current).some(file=>file.startsWith(prefix)&&!before[file]))throw Error('New Plugin source changed before confirmation');
  await page.locator('.creator-question-card[data-status="pending"]').screenshot({path:path.join(out,'proposal-'+qaApprovals.length+'.png')});
  qaApprovals.push({kind:'simulated isolated QA user selection',seconds:(Date.now()-started)/1000,question:step,proposal,zeroNewPluginFilesBeforeApproval:true});
  await json(path.join(out,'qa-approvals.json'),qaApprovals);
  await page.getByRole('radio',{name:step.options.find((option:any)=>option.id==='start').label,exact:true}).check();
  await page.getByRole('button',{name:/确认选择|Confirm selection/i,exact:true}).click();
 }
 const all=events.map(row=>row.event),finish=all.findLast(event=>event.type==='RUN_FINISHED');
 const after=await hashes(fixture.hostRoot),changedPaths=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(file=>before[file]!==after[file]);
 const result:any={caseId,status:timedOut?'QA_TIMEOUT':all.at(-1)?.type==='RUN_ERROR'?'RUN_ERROR':finish?.result?.completion??'UNKNOWN',seconds:(Date.now()-started)/1000,finish:finish?.result,runErrors:all.filter(event=>event.type==='RUN_ERROR'),toolCalls:all.filter(event=>event.type==='TOOL_CALL_START').length,changedPaths,qaApprovals,browserErrors};
 await page.screenshot({path:path.join(out,'after.png'),fullPage:true});
 if(changedPaths.length)result.interaction=await verifyScenario({caseId,testCase,page,frame,fixture,dir:out});
 await cp(path.join(fixture.hostRoot,'src'),path.join(out,'host/src'),{recursive:true});
 await json(path.join(out,'result.json'),result);
 await json(pointer,{out,status:'finished',result});
 console.log(JSON.stringify({caseId,status:result.status,seconds:result.seconds,toolCalls:result.toolCalls,changedFiles:changedPaths.length,interaction:result.interaction?.status}));
}catch(error:any){
 const problem={status:'HARNESS_ERROR',name:error.name,message:String(error.message).replaceAll(env.CREATOR_MODEL_API_KEY!,'[REDACTED]'),seconds:started?(Date.now()-started)/1000:null,out};
 await json(path.join(out,'harness-error.json'),problem);
 await json(pointer,problem);
 console.log(JSON.stringify(problem));process.exitCode=1;
}finally{
 await browser?.close();
 if(fixture){await cp(path.join(fixture.hostRoot,'src'),path.join(out,'host/src'),{recursive:true}).catch(()=>{});await cp(path.join(fixture.hostRoot,'.agent-ui/creator'),path.join(out,'creator-records'),{recursive:true}).catch(()=>{});await fixture.close();}
 relay.closeAllConnections();await new Promise<void>(resolve=>relay.close(()=>resolve()));
 await json(path.join(out,'model-http-requests.json'),requests);
 await json(path.join(out,'cleanup.json'),{closed:true,at:new Date().toISOString()});
}
