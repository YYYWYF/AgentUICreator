import {readFile,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url)),run=process.argv[2]??'run1',dir=path.join(base,run);
const rows=(await readFile(path.join(dir,'natural/events-timed.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const http=JSON.parse(await readFile(path.join(dir,'model-http-requests.json'),'utf8'));
const calls=rows.filter(x=>x.event.type==='TOOL_CALL_START');
const request=http.filter(x=>['agent','summary'].includes(x.purpose));
const usage=request.reduce((a,x)=>({input:a.input+(x.usage?.prompt_tokens??0),output:a.output+(x.usage?.completion_tokens??0),total:a.total+(x.usage?.total_tokens??0)}),{input:0,output:0,total:0});
const startLine=(await readFile(path.join(base,run==='run1'?'evaluation.log':run+'-evaluation.log'),'utf8')).split('\n').find(s=>s.startsWith('{"case":"natural","started":'));
const nowSeconds=startLine?(Date.now()-Date.parse(JSON.parse(startLine).started))/1000:null;
const last=http.filter(x=>x.purpose==='agent').at(-1);
const sample={recordedAt:new Date().toISOString(),elapsedSeconds:nowSeconds,lastEventSeconds:rows.at(-1)?.seconds,toolCalls:calls.length,mutationAttempts:calls.filter(x=>/^(edit_|create_ui_|create_custom_|mutate_|apply_ui_)/u.test(x.event.toolCallName)).length,
 agentRequests:http.filter(x=>x.purpose==='agent').length,summaryRequests:http.filter(x=>x.purpose==='summary').length,providerReportedUsageLowerBound:usage,
 questions:rows.filter(x=>x.event.name==='on_interrupt').length,recentTools:calls.slice(-4).map(x=>x.event.toolCallName),lastSources:last?.hostSourceState?.map(f=>({path:f.path,start:f.start,end:f.end,truncated:f.truncated})),confirmedNewPlugins:last?.hostDevelopmentState?.[0]?.confirmedNewPlugins};
await appendFile(path.join(base,run+'-milestones.jsonl'),JSON.stringify(sample)+'\n');
console.log(JSON.stringify(sample,null,2));
