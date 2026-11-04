import {mkdir,readdir,readFile,writeFile,cp,symlink,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const base=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(base,'../..'),dest=path.join(base,'frozen/isolated');
const names=['core','renderer','runtime','plugins','web-component','creator'];
const old=Object.fromEntries(names.map(name=>[name,path.join(repo,name==='creator'?'artifacts/creator-reasoning-roundtrip-20261104/run1/frozen/creator':'artifacts/creator-capability-plan-20261103/frozen/'+name)]));
for(const name of names){
 const root=path.join(dest,name);await mkdir(root,{recursive:true});
 for(const entry of await readdir(old[name]))if(entry!=='node_modules')await cp(path.join(old[name],entry),path.join(root,entry),{recursive:true});
}
const targets=Object.fromEntries(names.map(name=>['@za38.03/agent-ui-'+name,path.join(dest,name)]));
for(const name of names){
 const from=path.join(old[name],'node_modules'),to=path.join(dest,name,'node_modules');await mkdir(to,{recursive:true});
 const link=async module=>{const target=targets[module]??await realpath(path.join(from,module));const output=path.join(to,module);await mkdir(path.dirname(output),{recursive:true});await symlink(target,output,process.platform==='win32'?'junction':'dir');};
 for(const entry of await readdir(from)){if(entry.startsWith('.'))continue;if(entry.startsWith('@'))for(const child of await readdir(path.join(from,entry)))await link(entry+'/'+child);else await link(entry);}
}
const changed=[];
for(const module of ['runner','context-window','plugin-applications'])for(const suffix of ['.js','.js.map','.d.ts','.d.ts.map']){
 const file='agent/'+module+suffix;await cp(path.join(base,'compiled-candidate',file),path.join(dest,'creator/dist',file));changed.push('dist/'+file);
}
const hash=value=>createHash('sha256').update(value).digest('hex');
const baselinePrompt=await readFile(path.join(old.creator,'dist/agent/prompts.json'));
const prompt=await readFile(path.join(dest,'creator/dist/agent/prompts.json'));
const summary=source=>source.match(/const SUMMARY_PROMPT = (`[\s\S]*?`);/)?.[1];
const summaryUnchanged=summary(await readFile(path.join(old.creator,'dist/agent/context-window.js'),'utf8'))===summary(await readFile(path.join(dest,'creator/dist/agent/context-window.js'),'utf8'));
const metadata={created:new Date().toISOString(),packageRoots:targets,changedCreatorModules:changed,promptsUnchanged:hash(baselinePrompt)===hash(prompt),summaryPromptUnchanged:summaryUnchanged,productionDistribution:'Exact previous five production snapshots, with all Agent UI dependency edges pointing inside this frozen graph.',thirdPartyDependencies:'Resolved version-specific real paths; no live workspace package aliases.'};
await writeFile(path.join(base,'isolated-distribution.json'),JSON.stringify(metadata,null,2));
console.log(JSON.stringify(metadata));
