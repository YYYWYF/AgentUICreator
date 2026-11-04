import {readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url));
const parseLines=async file=>(await readFile(file,'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
const cases=[];
for(const entry of await readdir(base,{withFileTypes:true})){
 if(!entry.isDirectory()||!/^case\d/.test(entry.name))continue;
 const folder=path.join(base,entry.name);
 let events;try{events=await parseLines(path.join(folder,'events-timed.jsonl'));}catch{continue;}
 const logDir=path.join(folder,'creator-records/logs');let logs=[];
 try{for(const name of await readdir(logDir))if(name.endsWith('.jsonl'))logs.push(...await parseLines(path.join(logDir,name)));}catch{}
 const counts={};for(const row of logs)counts[row.event]=(counts[row.event]??0)+1;
 const byId=new Map();const sequence=[];
 for(const row of events){const event=row.event;if(event.type==='TOOL_CALL_START'){const call={number:sequence.length+1,seconds:row.seconds,name:event.toolCallName,id:event.toolCallId};sequence.push(call);byId.set(call.id,call);}else if(event.type==='TOOL_CALL_ARGS'){const call=byId.get(event.toolCallId);if(call){try{call.args=JSON.parse(event.delta);}catch{call.unparsedArgs=event.delta;}}}else if(event.type==='TOOL_CALL_RESULT'){const call=byId.get(event.toolCallId);if(call){call.result=event.content??event.result??event;try{if(typeof call.result==='string')call.result=JSON.parse(call.result);}catch{}}}}
 const unique=new Set(),repeat=[];
 for(const call of sequence){const key=JSON.stringify([call.name,call.args]);if(unique.has(key))repeat.push(call.number);else unique.add(key);}
 const compression=logs.filter(row=>/context_(summary|compression|projection)/.test(row.event));
 const evidence=logs.filter(row=>/evidence|progress|recovery/.test(row.event));
 const text=events.filter(row=>row.event.type==='TEXT_MESSAGE_CONTENT').map(row=>row.event.delta??'').join('');
 const result={folder,eventCounts:counts,tools:sequence.length,identicalCalls:repeat,sequence,compression,evidence,visibleAssistantText:text,terminal:events.filter(row=>['RUN_ERROR','RUN_FINISHED','QA_STREAM_OBSERVER_ERROR'].includes(row.event.type)),lastLogs:logs.slice(-6)};
 cases.push(result);
}
await writeFile(path.join(base,'previous-log-analysis.json'),JSON.stringify(cases,null,2));
console.log(JSON.stringify(cases.map(item=>({case:path.basename(item.folder),tools:item.tools,identicalCalls:item.identicalCalls,eventCounts:item.eventCounts,lastLogEvent:item.lastLogs.at(-1)?.event,terminal:item.terminal.map(row=>({type:row.event.type,message:row.event.message,seconds:row.seconds})),visibleAssistantText:item.visibleAssistantText.slice(0,1600)})),null,2));
