import {readFile,writeFile,open} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnPnpm} from '../../scripts/pnpm-process.mjs';
const base=path.dirname(fileURLToPath(import.meta.url));
const external=['case01-cards','case03-message-actions'];
const pending=['case04-help-actions','case05-order','case06-inspection','case07-sales','case08-progress'];
const active=new Map(),finished=[];
const exists=async file=>{try{await readFile(file);return true;}catch{return false;}};
let checking=false;
const tick=async()=>{
 if(checking)return;checking=true;
 try{
  const externalActive=[];
  for(const id of external)if(!await exists(path.join(base,id,'natural/result.json'))&&!await exists(path.join(base,id,'natural/harness-error.json')))externalActive.push(id);
  while(pending.length&&externalActive.length+active.size<2){
   const id=pending.shift(),log=await open(path.join(base,id.slice(0,6)+'-evaluation.log'),'w');
   const child=spawnPnpm(['--filter','@za38.03/agent-ui-creator','exec','tsx',path.join(base,'evaluate.mts'),id],{stdio:['ignore',log.fd,log.fd]});
   active.set(id,{pid:child.pid,started:new Date().toISOString()});
   child.once('exit',async(code,signal)=>{finished.push({id,...active.get(id),code,signal,ended:new Date().toISOString()});active.delete(id);await log.close();});
  }
  await writeFile(path.join(base,'driver-state.json'),JSON.stringify({at:new Date().toISOString(),externalActive,pending,active:Object.fromEntries(active),finished},null,2));
  if(!externalActive.length&&!active.size&&!pending.length){clearInterval(timer);console.log('All seven scenario runs ended');}
 }finally{checking=false;}
};
const timer=setInterval(()=>void tick(),1500);
await tick();
