import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=fileURLToPath(new URL('../',import.meta.url));
for(const id of ['case07-sales','case08-progress']){
 try{
  const latest=JSON.parse(await readFile(path.join(base,'latest-'+id+'.json'),'utf8'));
  const env=JSON.parse(await readFile(path.join(latest.out,'environment.json'),'utf8'));
  const rows=await readFile(path.join(latest.out,'events-timed.jsonl'),'utf8').then(text=>text.trim().split(/\r?\n/).filter(Boolean).flatMap(line=>{try{return[JSON.parse(line)];}catch{return[];}})).catch(()=>[]);
  const tools=rows.filter(row=>row.event.type==='TOOL_CALL_START');
  const requests=await readFile(path.join(latest.out,'model-http-requests.json'),'utf8').then(JSON.parse).catch(()=>null);
  console.log(JSON.stringify({caseId:id,label:env.label,status:latest.status,seconds:latest.started?(Date.now()-Date.parse(latest.started))/1000:latest.result?.seconds,tools:tools.length,lastTool:tools.at(-1)?.event.toolCallName,mutationAttempts:tools.filter(row=>/^(create_ui_plugin|create_custom_plugin|create_ui_source_file|edit_file|edit_file_from_read|mutate_app_ui_model|mutate_ui_plugin_source|apply_ui_)/.test(row.event.toolCallName)).map(row=>({tool:row.event.toolCallName,seconds:row.seconds})),modelRequests:requests?.length,streamErrors:requests?.filter(request=>request.streamError).map(request=>request.streamError),httpFailures:requests?.filter(request=>request.status&&request.status!==200).length,nativeErrors:latest.result?.runErrors?.map(error=>({code:error.code,message:error.message})),changedFiles:latest.result?.changedPaths?.length,interaction:latest.result?.interaction?.status}));
 }catch(error){console.log(JSON.stringify({caseId:id,status:'not-ready',message:error.message}));}
}
