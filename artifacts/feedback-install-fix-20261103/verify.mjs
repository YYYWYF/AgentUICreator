import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {CreatorProcessManager} from '../../packages/creator/dist/CreatorProcessManager.js';
import {createCreatorCommandHandler} from '../../packages/creator/dist/commands/command-api.js';
import {ensureManagedOperator} from '../../packages/creator/dist/operator/src/install.mjs';
import * as api from '../../packages/creator/dist/operator/dist/runtime/operator-runtime.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const run=promisify(execFile);
const root=await mkdtemp(path.join(tmpdir(),'feedback public API 中文 '));
const result={scope:'macOS; rebuilt public Creator project API; actual local Creator worker and command HTTP transaction; prepared local dependencies; no model calls, browser acceptance, fresh online install or real Windows run',steps:[]};
let manager,server;
const record=(name,details={})=>{result.steps.push({name,status:'passed',...details});console.log(JSON.stringify(result.steps.at(-1)));};
try{
 await run(process.execPath,[path.join(repo,'packages/creator/operator/tests/support/prepare-host.mjs'),root,repo,'assistant'],{maxBuffer:4e6});
 await ensureManagedOperator(root);
 const modelFile=path.join(root,'src/agent-ui/app-ui.json');
 const lockFile=path.join(root,'.agent-ui/source-lock.json');
 const sourceLock=await readFile(lockFile);
 const before=JSON.parse(await readFile(modelFile,'utf8'));
 const walk=model=>{
  const found=[];
  const visit=value=>{if(!value||typeof value!=='object')return;if(typeof value.pluginId==='string')found.push(value);for(const child of Object.values(value)){if(Array.isArray(child))child.forEach(visit);else visit(child);}};
  visit(model);return found;
 };
 const footer=walk(before).find(p=>p.pluginId==='response-footer');
 const actions=structuredClone(footer.slots.actions);
 assert(actions.some(p=>p.pluginId==='copy-action'));
 const installed=await api.installOfficialAgentUIResource(root,'message-feedback',{runPackages:async()=>{throw new Error('Unexpected package installation')}});
 assert.equal(installed.verification.status,'passed');
 let model=JSON.parse(await readFile(modelFile,'utf8'));
 const feedback=walk(model).filter(p=>p.pluginId==='feedback-actions');assert.equal(feedback.length,1);
 const id=feedback[0].id;
 const installedFooter=walk(model).find(p=>p.pluginId==='response-footer');
 assert.deepEqual(installedFooter.slots.actions.filter(p=>p.pluginId!=='feedback-actions'),actions);
 record('official-resource-install',{changed:installed.changed,feedbackInstanceId:id,existingActions:actions.map(p=>p.pluginId)});
 const application=await readFile(path.join(root,'src/agent-ui/plugins/feedback-actions/index.tsx'));
 const modelBytes=await readFile(modelFile);
 const repeated=await api.installOfficialAgentUIResource(root,'message-feedback');assert.equal(repeated.changed,false);assert.deepEqual(await readFile(modelFile),modelBytes);
 record('repeat-install-is-idempotent');
 manager=new CreatorProcessManager({projectRoot:root,configRoot:root,environment:{...process.env,CREATOR_AGENT_MODE:'echo',CREATOR_VERIFICATION_MODE:'static_only',CREATOR_HOT_RELOAD:'false'}});
 await manager.ensureStarted();
 server=createServer(createCreatorCommandHandler(undefined,root,manager));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const workspaceId=createHash('sha256').update(await realpath(root)).digest('hex');
 const headers={'Content-Type':'application/json','x-agent-ui-workspace-id':workspaceId};
 const execute=async command=>{
  const response=await fetch(origin+'/execute',{method:'POST',headers,body:JSON.stringify({id:command,args:{instanceId:id}})});
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
  assert.equal(body.receipt.verification.status,'changed-and-statically-verified');return body;
 };
 await execute('disable');
 assert.equal((await api.inspectOfficialAgentUIResourceCatalog(root)).find(r=>r.id==='message-feedback').status,'disabled');
 record('slash-disable-through-real-worker');
 const catalog=await (await fetch(origin,{headers})).json();
 assert(catalog.commands.find(c=>c.id==='enable').options.some(o=>o.id===id));
 await execute('enable');
 assert.equal((await api.inspectOfficialAgentUIResourceCatalog(root)).find(r=>r.id==='message-feedback').status,'ready');
 model=JSON.parse(await readFile(modelFile,'utf8'));assert.equal(walk(model).filter(p=>p.pluginId==='feedback-actions').length,1);
 assert.deepEqual(walk(model).find(p=>p.pluginId==='response-footer').slots.actions.filter(p=>p.pluginId!=='feedback-actions'),actions);
 assert.deepEqual(await readFile(lockFile),sourceLock);assert.deepEqual(await readFile(path.join(root,'src/agent-ui/plugins/feedback-actions/index.tsx')),application);
 record('slash-enable-through-real-worker',{sourceLockAndApplicationPreserved:true});
 await run(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],{cwd:root,maxBuffer:4e6});record('consumer-typecheck');
 await run(process.execPath,['build.mjs'],{cwd:root,maxBuffer:4e6});record('consumer-production-build');
 result.status='passed';
}catch(e){result.status='failed';result.error={message:e.message,code:e.code,details:e.technicalDetails,stdout:e.stdout,stderr:e.stderr};console.log(JSON.stringify({status:result.status,error:result.error}));process.exitCode=1;}
finally{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 if(manager)await manager.dispose();
 await rm(root,{recursive:true,force:true});
 await writeFile(fileURLToPath(new URL('./results.json',import.meta.url)),JSON.stringify(result,null,2));
}
