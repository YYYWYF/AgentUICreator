import {RunActivity} from '../../../packages/creator/src/agent/activity.ts';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root=await mkdtemp(path.join(os.tmpdir(),'creator-log-stress-'));
const activity=new RunActivity(root,'windows-log-stress',new AbortController().signal);
let stop=false,reads=0,writes=0;
const started=Date.now();
const reader=(async()=>{while(!stop){await readFile(path.join(root,activity.logPath)).then(()=>reads++).catch(()=>{});await new Promise(resolve=>setTimeout(resolve,1));}})();
const result:any={platform:process.platform,node:process.version,targetWrites:150};
try{for(;writes<150;writes++)await activity.log('stress',{payload:'x'.repeat(1024)});result.status='passed';}
catch(error:any){result.status='failed';result.code=error.code;result.message=error.message;}
finally{stop=true;await reader;Object.assign(result,{writes,reads,seconds:(Date.now()-started)/1000});await writeFile(new URL('../local-runs/log-stress.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await rm(root,{recursive:true,force:true});}
