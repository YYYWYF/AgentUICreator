import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url));
const beforeBase=path.join(base,'../creator-context-engineering-20261104/run2');
const currentRun=process.argv[2]??'run1';
const input=JSON.parse(await readFile(path.join(base,currentRun,'environment.json'),'utf8'));
async function collect(label,dir){
 const r=JSON.parse(await readFile(path.join(dir,'natural/result.json'),'utf8'));
 const events=(await readFile(path.join(dir,'natural/events-timed.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 const http=JSON.parse(await readFile(path.join(dir,'model-http-requests.json'),'utf8'));
 const logsDir=path.join(dir,'natural/host/.agent-ui/creator/logs');
 const logs=(await Promise.all((await readdir(logsDir)).filter(f=>f.endsWith('.jsonl')).map(f=>readFile(path.join(logsDir,f),'utf8')))).flatMap(s=>s.trim().split('\n').filter(Boolean).map(JSON.parse));
 const counts={},failures=[];let successfulWrites=0;
 const names=new Map();
 for(const {event:e,seconds}of events){
  if(e.type==='TOOL_CALL_START'){counts[e.toolCallName]=(counts[e.toolCallName]??0)+1;names.set(e.toolCallId,e.toolCallName);}
  if(e.type==='TOOL_CALL_RESULT'){
   const v=JSON.parse(e.content),name=names.get(e.toolCallId);
   if(v.ok===false)failures.push({seconds,tool:name,code:v.error?.code});
   else if(/^(edit_|create_ui_|create_custom_|mutate_|apply_ui_)/u.test(name??''))successfulWrites++;
  }
 }
 function usage(requests){return requests.reduce((a,x)=>{const u=x.usage;if(!u){a.requestsWithoutUsage++;return a;}a.input+=u.prompt_tokens??0;a.output+=u.completion_tokens??0;a.total+=u.total_tokens??((u.prompt_tokens??0)+(u.completion_tokens??0));a.cachedInput+=u.prompt_tokens_details?.cached_tokens??0;a.reasoningOutput+=u.completion_tokens_details?.reasoning_tokens??0;return a;},{input:0,output:0,total:0,cachedInput:0,reasoningOutput:0,requestsWithoutUsage:0});}
 const compactions=logs.filter(x=>x.event==='context_compaction');
 const relevant=http.filter(x=>['agent','summary'].includes(x.purpose));
 const evidence=logs.filter(x=>x.event==='evidence_progress');
 const initial=JSON.parse(await readFile(path.join(dir,'natural/before-hashes.json'),'utf8'));
 const baseline=JSON.parse(await readFile(path.join(beforeBase,'natural/before-hashes.json'),'utf8'));
 const equal=JSON.stringify(Object.entries(initial).sort())===JSON.stringify(Object.entries(baseline).sort());
 const writeTools=/^(edit_|create_ui_|create_custom_|mutate_|apply_ui_)/u;
 const calls=events.filter(x=>x.event.type==='TOOL_CALL_START');
 const firstWrite=calls.findIndex(x=>writeTools.test(x.event.toolCallName));
 return {label,status:r.status,seconds:r.seconds,model:r.prompt?input.model:undefined,prompt:r.prompt,toolCalls:calls.length,toolCounts:counts,
  agentRequests:http.filter(x=>x.purpose==='agent').length,summaryRequests:http.filter(x=>x.purpose==='summary').length,
  providerReportedUsage:usage(relevant),allModelUsage:usage(http),reasoningContinuation:{agentRequestsWithNonemptyIncoming:http.filter(x=>x.purpose==='agent'&&x.incomingReasoningCharacters>0).length,assistantMessages:http.filter(x=>x.purpose==='agent').flatMap(x=>x.assistantContinuation??[]).length,assistantMessagesWithField:http.filter(x=>x.purpose==='agent').flatMap(x=>x.assistantContinuation??[]).filter(x=>x.hasReasoningField).length,assistantMessagesWithNonemptyReasoning:http.filter(x=>x.purpose==='agent').flatMap(x=>x.assistantContinuation??[]).filter(x=>x.reasoningCharacters>0).length},agentUsage:usage(http.filter(x=>x.purpose==='agent')),summaryUsage:usage(http.filter(x=>x.purpose==='summary')),permissionUsage:usage(http.filter(x=>x.purpose==='permission')),
  compactions:compactions.length,summarySeconds:compactions.reduce((a,x)=>a+x.seconds,0),compression:compactions.map(x=>({beforeEstimatedTokens:x.beforeEstimatedTokens,afterEstimatedTokens:x.afterEstimatedTokens,seconds:x.seconds})),
  firstPreparation:r.firstPreparation,firstMutationAttempt:firstWrite<0?null:{toolNumber:firstWrite+1,seconds:calls[firstWrite].seconds,tool:calls[firstWrite].event.toolCallName},successfulWriteTools:successfulWrites,changedPaths:r.changedPaths,
  questions:r.questions?.length,qaConfirmationSeconds:r.qaApproval?.seconds,interaction:r.interaction??null,browserErrors:r.browserErrors,failures,
  evidenceReads:evidence.length,unchangedEvidenceReads:evidence.filter(x=>!x.newEvidence).length,sourceHashSetMatchesBaseline:equal,
  modelBatchRejections:logs.filter(x=>x.event==='tool_batch_rejected'),completionRejections:logs.filter(x=>x.event==='completion_rejected'),transportRecoveries:logs.filter(x=>x.event==='model_transport_recovery'),
  toolSchemaCounts:Object.fromEntries([...new Set(http.filter(x=>x.purpose==='agent').map(x=>x.toolCount))].map(count=>[count,http.filter(x=>x.purpose==='agent'&&x.toolCount===count).length])),
  confirmedStateDeliveredRequests:http.filter(x=>x.purpose==='agent'&&x.hostDevelopmentState?.some(s=>s.confirmedNewPlugins?.length)).length,
  completeCardSourceDeliveredRequests:http.filter(x=>x.purpose==='agent'&&x.hostSourceState?.some(s=>s.path==='src/agent-ui/plugins/quick-help-card/index.tsx'&&s.start===1&&s.end>=52&&!s.truncated)).length,
  runtimeErrors:r.runErrors?.map(e=>({code:e.code,message:e.message,verification:e.metadata?.receipt?.verification})),
  runIds:events.filter(x=>x.event.type==='RUN_STARTED').map(x=>x.event.runId)};
}
const before=await collect('before_reasoning_fix',beforeBase),after=await collect('after_reasoning_fix',path.join(base,currentRun));
const result={model:input.model,settings:input,notes:['Provider-reported cumulative usage for Agent plus summary calls; cached input is included in input, reasoning is included in output. Permission classification is recorded separately. Missing usage makes counts lower bounds.','Same original task, pristine initial source and production dependency snapshots. One native new-Plugin question may be answered by QA in the disposable project. No scripted model decisions.','Only Creator Chat Completions reasoning roundtrip and its budget accounting changed. Prompts, Skills, documentation, original source and production dependencies were checked against the immediately preceding engineering run2 snapshot. Missing historical reasoning is sent as an empty string where the provider requires it. No private reasoning text was logged.','macOS run; real Windows not run.'],before,after};
await writeFile(path.join(base,'results.json'),JSON.stringify(result,null,2));
const fields=['label','status','seconds','toolCalls','agentRequests','summaryRequests','input','output','total','firstWriteSeconds','changedFiles','compactions','summarySeconds'];
const values=[before,after].map(r=>[r.label,r.status,r.seconds,r.toolCalls,r.agentRequests,r.summaryRequests,r.providerReportedUsage.input,r.providerReportedUsage.output,r.providerReportedUsage.total,r.firstMutationAttempt?.seconds??'',r.changedPaths?.length??0,r.compactions,r.summarySeconds]);
await writeFile(path.join(base,'results.csv'),[fields.join(','),...values.map(v=>v.join(','))].join('\n')+'\n');
console.log(JSON.stringify({before:{seconds:before.seconds,tools:before.toolCalls,tokens:before.providerReportedUsage.total},after:{status:after.status,seconds:after.seconds,tools:after.toolCalls,tokens:after.providerReportedUsage.total,firstMutation:after.firstMutationAttempt,changedPaths:after.changedPaths,interaction:after.interaction}},null,2));
