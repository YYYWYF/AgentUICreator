import {CreatorAgentRuntime} from '../../../../packages/creator/dist/agent/runner.js';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const root=process.cwd();
const runtime=new CreatorAgentRuntime(root,path.join(root,'packages/creator/skills'),path.join(root,'packages/creator/contracts/creator'),root);
const origin=new URL(runtime.environment.CREATOR_MODEL_BASE_URL!).origin;
const originalFetch=globalThis.fetch;
const requests:any[]=[];
globalThis.fetch=async(input:any,init:any)=>{
 const url=new URL(String(input instanceof Request?input.url:input));
 if(url.origin!==origin)return originalFetch(input,init);
 const body=JSON.parse(String(init?.body??'{}'));
 const meta:any={responseFormat:body.response_format?.type,maxTokens:body.max_tokens};requests.push(meta);
 const response=await originalFetch(input,init);meta.httpStatus=response.status;return response;
};
const started=Date.now();let result:any;
try{
 const policy=await(runtime as any).classify([{role:'user',content:'把输入框高度调大'}],'route-probe-'+randomUUID(),new AbortController().signal,{status:'available',plugins:[{pluginId:'composer',name:'Composer',instances:[]}]});
 result={status:policy.readOnly===false?'passed':'unexpected-policy',policy,requests,seconds:(Date.now()-started)/1000};
}catch(error:any){result={status:'failed',message:String(error.message).replaceAll(runtime.environment.CREATOR_MODEL_API_KEY!,'[REDACTED]'),requests,seconds:(Date.now()-started)/1000};}
finally{globalThis.fetch=originalFetch;}
await writeFile(new URL('./route-probe.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));process.exitCode=result.status==='passed'?0:1;
