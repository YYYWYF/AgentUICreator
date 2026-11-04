import fs from 'node:fs';import path from 'node:path';
for(const id of ['case08-progress','case07-sales','case08-progress-262k','case07-sales-262k']){
 if(!fs.existsSync(`.agent-ui/creator/windows-tests/latest-${id}.json`))continue;
 const latest=JSON.parse(fs.readFileSync(`.agent-ui/creator/windows-tests/latest-${id}.json`,'utf8'));
 const file=path.join(latest.out,'events-timed.jsonl');const rows=fs.existsSync(file)?fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).flatMap(s=>{try{return[JSON.parse(s)];}catch{return[];}}):[];
 const calls=rows.filter(r=>r.event.type==='TOOL_CALL_START');const writes=calls.filter(r=>/^(create_|edit_|mutate_)/.test(r.event.toolCallName));
 const nativeDir=latest.hostRoot?path.join(latest.hostRoot,'.agent-ui/creator/logs'):path.join(latest.out,'creator-records/logs');let logs=[];
 if(nativeDir&&fs.existsSync(nativeDir))for(const name of fs.readdirSync(nativeDir).filter(s=>s.endsWith('.jsonl')))logs.push(...fs.readFileSync(path.join(nativeDir,name),'utf8').split(/\r?\n/).filter(Boolean).flatMap(s=>{try{return[JSON.parse(s)];}catch{return[];}}));
 const projection=logs.findLast(r=>r.event==='context_projection');
 console.log(JSON.stringify({id,status:latest.status,elapsed:latest.started?Math.round((Date.now()-Date.parse(latest.started))/1000):latest.result?.seconds,tools:calls.length,last:calls.slice(-4).map(r=>({s:r.seconds,name:r.event.toolCallName})),writes:writes.map(r=>({s:r.seconds,name:r.event.toolCallName})),approvals:rows.filter(r=>r.event.type==='CUSTOM'&&r.event.name==='on_interrupt').length,compression:projection&&{compactions:projection.compactions,summarySeconds:Math.round(projection.summarySeconds),summaryCalls:projection.summaryModelCalls},recovery:logs.filter(r=>r.event==='evidence_route_recovery').length,result:latest.result&&{status:latest.result.status,changedPaths:latest.result.changedPaths,interaction:latest.result.interaction&&{status:latest.result.interaction.status,checks:latest.result.interaction.checks?.map(c=>({name:c.name,status:c.status})),error:latest.result.interaction.error?.slice(0,300)}}}));
}
