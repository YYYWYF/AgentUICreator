import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const rows=[];
for(const name of ['baseline','treatment']){
 const dir=path.join(root,name);let result;try{result=JSON.parse(await readFile(path.join(dir,'result.json'),'utf8'));}catch{try{result={case:name,harnessError:JSON.parse(await readFile(path.join(dir,'harness-error.json'),'utf8'))};}catch{result={case:name,status:'RUNNING'};}}
 let requests=[];try{requests=JSON.parse(await readFile(path.join(dir,'model-http-requests.json'),'utf8'));}catch{}if(!requests.length)try{requests=JSON.parse(await readFile(path.join(root,'model-http-requests.json'),'utf8')).filter(x=>x.case===name);}catch{}
 const usage=requests.filter(x=>x.usage);let log=[];try{for(const f of await readdir(path.join(dir,'host/.agent-ui/creator/logs')))if(f.endsWith('.jsonl'))for(const l of (await readFile(path.join(dir,'host/.agent-ui/creator/logs',f),'utf8')).trim().split('\n'))try{log.push(JSON.parse(l));}catch{}}catch{}
 const compactions=log.filter(x=>x.event==='context_compaction');const tools={};for(const t of result.tools??[])tools[t]=(tools[t]??0)+1;
 rows.push({...result,agentModelCalls:log.filter(x=>x.event==="model_call").length,modelHTTPRequests:requests.length,usageRecords:usage.length,tokenTotals:usage.reduce((a,x)=>({input:a.input+(x.usage.prompt_tokens??0),output:a.output+(x.usage.completion_tokens??0),total:a.total+(x.usage.total_tokens??0)}),{input:0,output:0,total:0}),summaryRequests:requests.filter(x=>x.purpose==='summary').length,compactions:compactions.length,summarySeconds:compactions.reduce((a,x)=>a+x.seconds,0),toolCounts:tools});
}
await writeFile(path.join(root,'comparison.json'),JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows.map(({case:n,status,seconds,firstPreparation,firstMutationAttempt,changedPaths,agentModelCalls,modelHTTPRequests,usageRecords,tokenTotals,compactions,summarySeconds,questions,harnessError})=>({case:n,status,seconds,firstPreparation,firstMutationAttempt,changedPaths,agentModelCalls,modelHTTPRequests,usageRecords,tokenTotals,compactions,summarySeconds,questions,harnessError})),null,2));
