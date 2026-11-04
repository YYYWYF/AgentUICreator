import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(base,'../..');
const previous=path.join(repo,'artifacts/creator-confirmation-simplification-20261104/v3');
const root=path.join(previous,'natural/host');
const rows=(await readFile(path.join(previous,'natural/events-timed.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
const logDir=path.join(root,'.agent-ui/creator/logs');
const {readdir}=await import('node:fs/promises');
const log=(await readFile(path.join(logDir,(await readdir(logDir))[0]!),'utf8')).trim().split('\n').map(JSON.parse);
const rounds=log.filter(x=>x.event==='model_call');
const reports=[];
for(const [label,distribution]of [['before',path.join(previous,'frozen/creator')],['after',path.join(base,'run1/frozen/creator')]]){
 const {rememberSourceRead,workingContext}=await import(pathToFileURL(path.join(distribution,'dist/agent/working-context.js')).href);
 const {rememberInspectedPlugin}=await import(pathToFileURL(path.join(distribution,'dist/agent/edit-context.js')).href);
 const {selectEditingTarget}=await import(pathToFileURL(path.join(distribution,'dist/agent/editing-session.js')).href);
 const ctx:any={root,readOnly:false,authorizedPlugins:new Set(),pluginPlans:new Map(),signal:new AbortController().signal,activity:{observations:new Map(),after:new Map()},readRanges:new Map()};
 const calls=new Map();let n=0;const frames=new Map([[0,{}]]);
 function source(f:any,offset:number){const key=f.path.replace(/^\//u,'');ctx.activity.observations.set(key,{hash:f.hash});ctx.readRanges.set(key,[...(ctx.readRanges.get(key)??[]),{hash:f.hash,start:offset+1,end:offset+f.content.split('\n').length}]);rememberSourceRead(ctx,f,offset);}
 for(const {event:e}of rows){
  if(e.type==='TOOL_CALL_START')calls.set(e.toolCallId,{n:++n,name:e.toolCallName,args:''});
  else if(e.type==='TOOL_CALL_ARGS')calls.get(e.toolCallId).args+=e.delta;
  else if(e.type==='TOOL_CALL_RESULT'){
   const c=calls.get(e.toolCallId),a=JSON.parse(c.args),envelope=JSON.parse(e.content),v=envelope.result;
   if(envelope.ok){
    if(c.name==='read_file'&&!a.file_path.startsWith('/skills/'))source(v,a.offset??0);
    if(c.name==='inspect_ui_plugin')await rememberInspectedPlugin(ctx,v,{referenceOnly:Boolean(a.sharedModule||a.sharedSymbols?.length)});
    if(c.name==='inspect_ui_edit_context'&&v.target){for(const f of v.files)source(f,0);await selectEditingTarget(ctx,v.target,v.files.map(f=>f.path));}
    if(c.name==='prepare_ui_plugin_development'&&v.status==='authorized')ctx.authorizedPlugins.add(a.targetPluginId);
   }
   const s=workingContext(ctx,3000).find((m:any)=>m.content.startsWith('Host same-run'));
   const files=s?JSON.parse(s.content.slice(s.content.indexOf('\n')+1)).files:[];
   frames.set(c.n,{selected:ctx.editingSelection?.target.pluginId,files:files.map((f:any)=>({path:f.path,start:f.start,end:f.end,truncated:f.truncated}))});
  }
 }
 const projected=rounds.map(r=>({modelCall:r.modelCalls,afterTool:r.toolCalls,...frames.get(r.toolCalls)}));
 const relevant=projected.filter(r=>r.afterTool>=20);
 reports.push({label,modelRoundsAfterFullContext:relevant.length,cardSourceRetained:relevant.filter(r=>r.files?.some((f:any)=>f.path==='src/agent-ui/plugins/quick-help-card/index.tsx')).length,selectedCard:relevant.filter(r=>r.selected==='quick-help-card').length,rounds:projected});
}
await writeFile(path.join(base,'context-replay.json'),JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports.map(({rounds,...summary})=>summary),null,2));
