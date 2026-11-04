import {readFile,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url));
const cases=JSON.parse(await readFile(path.join(base,'questions.json'),'utf8'));
const samples=[];
for(const entry of cases){
 const dir=path.join(base,entry.id,'natural');let rows=[],result,http=[];
 try{result=JSON.parse(await readFile(path.join(dir,'result.json'),'utf8'));}catch{}
 try{rows=(await readFile(path.join(dir,'events-timed.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch{}
 try{http=JSON.parse(await readFile(path.join(base,entry.id,'model-http-requests.json'),'utf8'));}catch{}
 const calls=rows.filter(row=>row.event.type==='TOOL_CALL_START');
 const usage=http.reduce((sum,row)=>({input:sum.input+(row.usage?.prompt_tokens??0),output:sum.output+(row.usage?.completion_tokens??0),total:sum.total+(row.usage?.total_tokens??0)}),{input:0,output:0,total:0});
 let error;try{error=JSON.parse(await readFile(path.join(dir,'harness-error.json'),'utf8'));}catch{}
 samples.push({id:entry.id,status:result?.status??(error?'HARNESS_ERROR':(calls.length||http.length)?'RUNNING':'WAITING'),seconds:result?.seconds??rows.at(-1)?.seconds,tools:calls.length,writes:calls.filter(row=>/^(edit_|create_ui_|create_custom_|mutate_|apply_ui_)/u.test(row.event.toolCallName)).length,changedFiles:result?.changedPaths?.length,interaction:result?.interaction?{status:result.interaction.status??(result.interaction.error?'failed':'passed'),checks:result.interaction.checks?.map(check=>({name:check.name,status:check.status})),error:result.interaction.error?.split('\n')[0]}:undefined,questions:rows.filter(row=>row.event.name==='on_interrupt').length,modelRequests:http.length,usage,recentTools:calls.slice(-3).map(row=>row.event.toolCallName),error});
}
await appendFile(path.join(base,'milestones.jsonl'),JSON.stringify({at:new Date().toISOString(),cases:samples})+'\n');
console.log(JSON.stringify(samples,null,2));
