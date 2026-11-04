import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const input=path.join(repo,'.agent-ui/creator/windows-tests');
const output=path.join(repo,'artifacts/creator-windows-20261105');
const secrets=[];
const envText=await fs.readFile(path.join(repo,'.agent-ui/creator/.env.local'),'utf8');
for(const line of envText.split(/\r?\n/)){const m=/^\s*(?:CREATOR_MODEL_API_KEY|CREATOR_AUTH_TOKEN)\s*=\s*(.+?)\s*$/.exec(line);if(m&&m[1].length>=12)secrets.push(m[1].replace(/^['"]|['"]$/g,''));}
const secretPattern=/(?:oc_sk_[A-Za-z0-9_-]{12,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})/g;
const privateKey=/^(?:api[_-]?key|authorization|auth[_-]?token|access[_-]?token|refresh[_-]?token|password|cookie|set-cookie|secret)$/i;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function cleanText(text){
 for(const secret of secrets)text=text.split(secret).join('[REDACTED]');
 text=text.replace(secretPattern,'[REDACTED]');
 text=text.replace(/(Bearer\s+)[A-Za-z0-9._-]{12,}/gi,'$1[REDACTED]').replace(/(--auth-token\s+)[A-Za-z0-9._-]{12,}/gi,'$1[REDACTED]');
 for(const [from,to]of [[repo,'<WORKSPACE>'],[process.env.USERPROFILE,'<USER_PROFILE>']])if(from){for(const value of [from,from.replaceAll('\\','/'),JSON.stringify(from).slice(1,-1)])text=text.split(value).join(to);}
 return text;
}
function clean(value){
 if(typeof value==='string')return cleanText(value);
 if(Array.isArray(value))return value.map(clean);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,
   privateKey.test(key)&&typeof item==='string'?'[REDACTED]'
   :/^(?:reasoning_content|reasoning|thinking)$/i.test(key)&&typeof item==='string'?'[REDACTED_PROVIDER_REASONING]'
   :/^REASONING_/.test(value.type??'')&&['delta','content'].includes(key)?'[REDACTED_PROVIDER_REASONING]':clean(item)]));
}
function content(bytes,file){
 const text=bytes.toString('utf8');
 if(file.endsWith('.json')){try{return Buffer.from(JSON.stringify(clean(JSON.parse(text)),null,2)+'\n');}catch{}}
 if(file.endsWith('.jsonl'))return Buffer.from(text.split(/\r?\n/).filter(Boolean).map(line=>{try{return JSON.stringify(clean(JSON.parse(line)));}catch{return cleanText(line);}}).join('\n')+'\n');
 if(file.endsWith('.sse'))return Buffer.from(text.split(/\r?\n/).map(line=>{if(line.startsWith('data: ')&&line!=='data: [DONE]'){try{return 'data: '+JSON.stringify(clean(JSON.parse(line.slice(6))));}catch{}}return cleanText(line);}).join('\n'));
 return Buffer.from(cleanText(text));
}
const manifest=[];
async function copyRecords(dir,relative=''){
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  if(entry.isSymbolicLink()||['node_modules','doc-example-project','.gitignore','active-test-sessions.json'].includes(entry.name)||entry.name.startsWith('.env'))continue;
  const rel=path.posix.join(relative,entry.name),source=path.join(dir,entry.name),target=path.join(output,'records',rel);
  if(entry.isDirectory()){await copyRecords(source,rel);continue;}
  const original=await fs.readFile(source);let published=original;
  const exactSource=/(?:^|\/)host\/src\//.test(rel),binary=/\.(?:png|jpg|jpeg|webp|zip|gz)$/i.test(rel);
  if(exactSource){const text=original.toString('utf8');if(secrets.some(s=>text.includes(s))||secretPattern.test(text))throw Error('Credential-like content found in source archive: '+rel);secretPattern.lastIndex=0;}
  else if(!binary)published=content(original,rel);
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,published);
  manifest.push({path:'records/'+rel,bytes:published.length,originalSha256:sha(original),sha256:sha(published),sanitized:sha(original)!==sha(published)});
 }
}
await fs.mkdir(output,{recursive:true});
await copyRecords(input);
const scriptDir=path.join(output,'scripts');await fs.mkdir(scriptDir,{recursive:true});
for(const name of ['evaluate.mts','connection-host.mts','verify-scenario.mts','log-stress.mts','provider-roundtrip.mts']){
 let text=await fs.readFile(path.join(input,name),'utf8');
 if(name==='evaluate.mts')text=text.replace("from '../../../artifacts/creator-complex-scenarios-20261104/verify-scenario.mts'","from './verify-scenario.mts'")
  .replace("const base=path.dirname(fileURLToPath(import.meta.url));","const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../local-runs');");
 if(['log-stress.mts','provider-roundtrip.mts'].includes(name))text=text.replace("new URL('./", "new URL('../local-runs/");
 await fs.writeFile(path.join(scriptDir,name),cleanText(text));
}
let replay=await fs.readFile(path.join(input,'progress-optimization-20261104/replay-scenario.mts'),'utf8');
replay=replay.replace("from '../connection-host.mts'","from './connection-host.mts'").replace("from '../verify-scenario.mts'","from './verify-scenario.mts'")
 .replaceAll("'../../../../scripts/", "'../../../scripts/").replace("new URL('../../../../',import.meta.url)","new URL('../../../',import.meta.url)")
 .replace("const base=path.dirname(fileURLToPath(import.meta.url));","const artifactRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');\nconst base=path.join(artifactRoot,'local-runs');")
 .replace("const caseId=latest.result.caseId;","latest.out=path.resolve(artifactRoot,latest.out);\nconst caseId=latest.result.caseId;");
await fs.writeFile(path.join(scriptDir,'replay-scenario.mts'),cleanText(replay));
let examples=await fs.readFile(path.join(input,'progress-optimization-20261104/check-doc-examples.mjs'),'utf8');
examples=examples.replace("'../../../..'","'../../..'").replace("const base=path.dirname(fileURLToPath(import.meta.url));","const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../local-runs');");
await fs.writeFile(path.join(scriptDir,'check-doc-examples.mjs'),cleanText(examples));
const cases=[];
for(const id of ['case08-progress','case07-sales','case08-progress-262k','case07-sales-262k']){
 const latest=JSON.parse(await fs.readFile(path.join(input,'latest-'+id+'.json'),'utf8'));
 if(latest.status!=='finished')throw Error('Cannot publish a running final scenario: '+id);
 const folder=path.basename(latest.out);
 await fs.writeFile(path.join(output,'latest-'+id+'.json'),JSON.stringify({out:'records/'+folder,status:latest.status,result:clean(latest.result)},null,2)+'\n');
 const rows=(await fs.readFile(path.join(latest.out,'events-timed.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse);
 const calls=rows.filter(row=>row.event.type==='TOOL_CALL_START');const create=calls.find(row=>row.event.toolCallName==='create_ui_plugin');
 const created=create&&rows.find(row=>row.event.type==='TOOL_CALL_RESULT'&&row.event.toolCallId===create.event.toolCallId);
 const logs=[];for(const name of await fs.readdir(path.join(latest.out,'creator-records/logs')))if(name.endsWith('.jsonl'))logs.push(...(await fs.readFile(path.join(latest.out,'creator-records/logs',name),'utf8')).trim().split(/\r?\n/).map(JSON.parse));
 const projection=logs.findLast(row=>row.event==='context_projection');
 cases.push({id,path:'records/'+folder,status:latest.result.status,seconds:latest.result.seconds,tools:latest.result.toolCalls,changedFiles:latest.result.changedPaths.length,firstCreationCompletedSeconds:created?.seconds??null,compactions:projection?.compactions??0,summarySeconds:projection?.summarySeconds??0,originalBrowserStatus:latest.result.interaction?.status,originalBrowserChecks:latest.result.interaction?.checks?.map(c=>({name:c.name,status:c.status})),nativeOutcome:clean(latest.result.finish?.noChangeOutcome??null)});
}
await fs.writeFile(path.join(output,'summary.json'),JSON.stringify({capturedAt:new Date().toISOString(),platform:'win32',baselineCommit:'14162e2bf31f4f02c7fe7a782180e3f69f32192a',cases,progressCorrectedReplay:'records/progress-optimization-20261104/case08-progress-262k-replay/result.json',modelMetadata:'records/progress-optimization-20261104/model-metadata.json',notes:['Final live model runs predate the late application-entry delivery-audit fix. Its regression tests and final build are separately recorded.','The progress replay corrects only native details/summary selection; generated source hashes are unchanged.','Raw provider reasoning and credentials are excluded/redacted; original native outcomes are never backfilled.']},null,2)+'\n');
await fs.writeFile(path.join(output,'record-manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),records:manifest.length,bytes:manifest.reduce((n,x)=>n+x.bytes,0),files:manifest},null,2)+'\n');
console.log(JSON.stringify({output:path.relative(repo,output),files:manifest.length,bytes:manifest.reduce((n,x)=>n+x.bytes,0),cases:cases.map(c=>({id:c.id,status:c.status}))}));
