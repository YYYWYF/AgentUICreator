import {mkdtemp,cp,symlink,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {CreatorMockService} from '../../packages/creator/dist/mock/CreatorMockService.js';
import {handleCreatorMockRequest} from '../../packages/creator/dist/mock/mock-api.js';
import {installOfficialAgentUIResource} from '../../packages/creator/dist/operator/dist/runtime/operator-runtime.mjs';
const baseline=path.join(tmpdir(),'resource check 中文 WkpqV2');
const root=await mkdtemp(path.join(tmpdir(),'mock resource http 中文 '));
const service=new CreatorMockService({port:0});
const composer=process.argv.includes('--composer');
const scenarioId=composer?'composer-mention-context':'web-search';
const resourceIds=composer?['conversation-lexical-input','conversation-command-source','conversation-mention','composer-trigger-demo']:['web-search'];
const result={scope:'Actual Mock HTTP handler, managed Operator subprocess inspection, official resource installer; local prepared dependencies'};
let server;
try{
 await cp(baseline,root,{recursive:true,filter:source=>source!==path.join(baseline,'node_modules')});
 await symlink(path.join(baseline,'node_modules'),path.join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
 const project={id:'mock-install-check',projectRoot:root};
 server=createServer((req,res)=>void handleCreatorMockRequest(req,res,service,()=>project,undefined,
  async(id,resourceId)=>{if(id!==project.id)throw new Error('Project changed');await installOfficialAgentUIResource(root,resourceId,{runPackages:async()=>{throw new Error('Unexpected package installation')}});}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const post=async(route,body)=>{const response=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const before=await (await fetch(origin+'/compatibility')).json();
 result.before={status:before.status,canInstallResources:before.canInstallResources,resources:before.requirements.filter(r=>resourceIds.includes(r.id))};
 result.blockedSelection=await post('/select',{scenarioId,speed:0});
 result.installs=[];
 for(const resourceId of resourceIds){
  const installed=await post('/install-resources',{projectId:project.id,resourceId});
  result.installs.push({id:resourceId,status:installed.status,resource:installed.body.requirements?.find(r=>r.id===resourceId),error:installed.body.error});
 }
 result.select=await post('/select',{scenarioId,speed:0});
 const started=await post('/start',{});result.start={status:started.status,running:started.body.status};
 const response=await fetch(started.body.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({threadId:'resource-check',runId:'resource-check',messages:[],tools:[],context:[],state:{},forwardedProps:{}})});
 const stream=await response.text();result.stream={status:response.status,started:stream.includes('RUN_STARTED'),finished:stream.includes('RUN_FINISHED'),search:stream.includes('web_search')};
 result.status=before.status==='checked'&&result.installs.every(r=>r.status===200&&r.resource.status==='ready')&&result.blockedSelection.status===400&&result.select.status===200&&result.stream.finished?'passed':'failed';
 if(composer){
  const run=promisify(execFile);
  await run(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],{cwd:root,maxBuffer:4e6});result.typecheck='passed';
  await run(process.execPath,['build.mjs'],{cwd:root,maxBuffer:4e6});result.build='passed';
 }
}catch(e){result.status='failed';result.error={message:e.message,code:e.code};}
finally{await service.dispose();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(root,{recursive:true,force:true});await writeFile(fileURLToPath(new URL(composer?'./mock-composer-http.json':'./mock-http.json',import.meta.url)),JSON.stringify(result,null,2));}
console.log(JSON.stringify({...result,select:result.select?{status:result.select.status}:undefined}));
