import {readdir, readFile, writeFile, mkdtemp, cp, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import * as api from '../../packages/creator/dist/operator/dist/runtime/operator-runtime.mjs';
const run=promisify(execFile);
const names=(await readdir(tmpdir())).filter(n=>n.startsWith('resource check 中文 '));
if(names.length!==1)throw new Error('Expected exactly one active disposable baseline');
const baseline=path.join(tmpdir(),names[0]);
const root=await mkdtemp(path.join(tmpdir(),'web component recheck 中文 '));
const result={resource:'web-component-bridge',validation:'Existing local dependencies, declaration versions aligned to the actual resolved build tools in this disposable fixture'};
try {
 await cp(baseline,root,{recursive:true,filter:source=>source!==path.join(baseline,'node_modules')});
 await symlink(path.join(baseline,'node_modules'),path.join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
 const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 for(const name of ['vite','@vitejs/plugin-react']){
  const actual=JSON.parse(await readFile(path.join(root,'node_modules',name,'package.json'),'utf8')).version;
  for(const field of ['dependencies','devDependencies'])if(manifest[field]?.[name])manifest[field][name]=actual;
 }
 await writeFile(path.join(root,'package.json'),JSON.stringify(manifest,null,2));
 result.install=await api.installOfficialAgentUIResource(root,'web-component-bridge',{runPackages:async()=>{throw new Error('Unexpected dependency install')}});
 result.after=(await api.inspectOfficialAgentUIResourceCatalog(root)).find(i=>i.id==='web-component-bridge');
 await run(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],{cwd:root,maxBuffer:4e6});result.typecheck='passed';
 await run(process.execPath,['node_modules/vite/bin/vite.js','build','--config','src/agent-ui/integrations/web-component-bridge/vite.config.ts'],{cwd:root,maxBuffer:4e6});result.bridgeBuild='passed';
 result.status='passed';
}catch(e){result.status='failed';result.error={message:e.message,code:e.code,details:e.technicalDetails,stdout:e.stdout,stderr:e.stderr};}
finally{await writeFile(fileURLToPath(new URL('./web-component-recheck.json',import.meta.url)),JSON.stringify(result,null,2));await rm(root,{recursive:true,force:true});}
console.log(JSON.stringify(result));
