// Restore the historical Creator B delivery; never invoke a model or regenerate it.
import { cp, mkdir, rm, symlink, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
const repo=process.cwd();
const evidence=path.join(repo,'docs/verification/plugin-responsive-boundary');
const raw=process.env.RESPONSIVE_DELIVERED_HOST ?? '/Users/yifei/.codex/visualizations/2026/10/09/01a11ec8-65e6-7c82-a29d-c24c3262dc4b/business-closure/raw/B';
const delivered=path.join(repo,'docs/verification/creator-host-ui-delivery/business-closure/generated-source-diff/B');
const base=process.env.RESPONSIVE_HOST_ROOT ?? '/tmp/plugin-responsive-repair-hosts';
const plan=JSON.parse(await readFile(path.join(evidence,'repair-plan.json'),'utf8'));
if(plan.status!=='user-confirmed')throw Error('Apply only the recorded user-confirmed repair.');
for(const stage of ['before','after']){
 const root=path.join(base,stage);await rm(root,{recursive:true,force:true});await mkdir(root,{recursive:true});
 await cp(raw,root,{recursive:true,filter:file=>!['node_modules','dist','.vite'].some(part=>file.split(path.sep).includes(part))});
 await symlink(path.join(raw,'node_modules'),path.join(root,'node_modules'),'dir');
 await cp(delivered,root,{recursive:true,filter:file=>!file.endsWith('.diff')&&!file.endsWith('result.json')});
 for(const [file,hash] of Object.entries(plan.sourceHashes)){
  if(createHash('sha256').update(await readFile(path.join(root,file))).digest('hex')!==hash)throw Error('Historical source drift: '+file);
 }
 if(stage==='after')for(const file of Object.keys(plan.diffs)){
  let expected=await readFile(path.join(root,file),'utf8');for(const edit of plan.edits.filter(e=>e.file===file)){
   if(expected.split(edit.before).length!==2)throw Error('Stale repair anchor: '+file);
   expected=expected.replace(edit.before,edit.after);
  }
  const repaired=await readFile(path.join(evidence,'after',file),'utf8');if(repaired!==expected)throw Error('Saved repaired source disagrees with confirmed diff.');
  await cp(path.join(evidence,'after',file),path.join(root,file));
 }
}
const code=await new Promise((resolve,reject)=>{const child=spawn('pnpm',['--filter','@agent-ui/creator-workbench','exec','playwright','test','-c','playwright.responsive-repair.config.ts'],{stdio:'inherit',env:{...process.env,RESPONSIVE_HOST_ROOT:base}});child.on('error',reject);child.on('close',resolve);});
process.exitCode=code??1;
