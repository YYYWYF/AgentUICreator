import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url));
const latest=JSON.parse(await readFile(new URL('../latest-case08-progress.json',import.meta.url),'utf8'));
const folder=latest.out;
const lines=async file=>(await readFile(file,'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
const rows=await lines(path.join(folder,'events-timed.jsonl'));
const byId=new Map(),sequence=[];
for(const row of rows){const event=row.event;if(event.type==='TOOL_CALL_START'){const call={number:sequence.length+1,seconds:row.seconds,id:event.toolCallId,name:event.toolCallName};sequence.push(call);byId.set(call.id,call);}else if(event.type==='TOOL_CALL_ARGS'){const call=byId.get(event.toolCallId);if(call){try{call.args=JSON.parse(event.delta);}catch{call.rawArgs=event.delta;}}}else if(event.type==='TOOL_CALL_RESULT'){const call=byId.get(event.toolCallId);if(call){call.finishedSeconds=row.seconds;try{call.result=JSON.parse(event.content);}catch{call.result=event.content??event.result;}}}}
const logs=[];for(const name of await readdir(path.join(folder,'creator-records/logs')))if(name.endsWith('.jsonl'))logs.push(...await lines(path.join(folder,'creator-records/logs',name)));
const requests=JSON.parse(await readFile(path.join(folder,'model-http-requests.json'),'utf8'));
const approvals=await readFile(path.join(folder,'qa-approvals.json'),'utf8').then(JSON.parse).catch(()=>[]);
const questions=rows.filter(row=>row.event.type==='CUSTOM'&&row.event.name==='on_interrupt');
const result={folder,approvals,questions,sequence,logs,requests};
await writeFile(path.join(base,'progress-deep-analysis.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({folder,tools:sequence.length,approvals:approvals.map(item=>({seconds:item.seconds,proposal:item.proposal,question:item.question})),questions:questions.map(item=>({seconds:item.seconds,metadata:item.event.value?.metadata})),logEvents:logs.reduce((out,row)=>(out[row.event]=(out[row.event]??0)+1,out),{})},null,2));
for(const call of sequence)console.log(JSON.stringify({n:call.number,seconds:call.seconds,name:call.name,args:call.args,ok:call.result?.ok,error:call.result?.error?.code}));
