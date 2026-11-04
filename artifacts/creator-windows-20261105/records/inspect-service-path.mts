import {createRequire} from 'node:module';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const require=createRequire(new URL('../../../packages/creator/package.json',import.meta.url));
const {API}=require('typescript/unstable/sync');
const root=await mkdtemp(path.join(os.tmpdir(),'creator-service-path-'));
try{
 const file=path.join(root,'services','types.ts');await mkdir(path.dirname(file),{recursive:true});
 await writeFile(file,'export interface Options { endpoint: string; }');
 const absolute=path.resolve(file),observations:any[]=[];
 const api=new API({cwd:root,fs:{readFile:(candidate:string)=>{
  const resolved=path.resolve(candidate);
  if(resolved.toLowerCase()===absolute.toLowerCase())observations.push({candidate,resolved,absolute,exactMatch:resolved===absolute});
  return resolved===absolute?'export interface Options { endpoint: number; }':undefined;
 }}});
 try{const snapshot=api.updateSnapshot({openFiles:[absolute]});try{const source=snapshot.getDefaultProjectForFile(absolute)?.program.getSourceFile(absolute);console.log(JSON.stringify({platform:process.platform,observations,parsedText:source?.text}));}finally{snapshot.dispose();}}finally{api.close();}
}finally{await rm(root,{recursive:true,force:true});}
