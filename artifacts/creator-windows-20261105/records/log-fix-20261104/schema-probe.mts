import {createModel,hostEnvironment} from '../../../../packages/creator/src/agent/config.ts';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const env=hostEnvironment(process.cwd());
const results:any[]=[];
const session='schema-probe-'+randomUUID();
for(const uniqueItems of [true,false]){
 const started=Date.now();
 const schema={type:'object',properties:{pluginIds:{type:'array',...(uniqueItems?{uniqueItems:true}:{}),items:{type:'string'}}},required:['pluginIds'],additionalProperties:false};
 try{
  const response=await createModel(env,session).invoke('Return a JSON object with pluginIds containing the single string test.',{response_format:{type:'json_schema',json_schema:{name:'schema_probe',strict:true,schema}}});
  results.push({uniqueItems,status:'passed',seconds:(Date.now()-started)/1000,finishReason:response.response_metadata?.finish_reason,usage:response.usage_metadata});
 }catch(error:any){results.push({uniqueItems,status:'failed',seconds:(Date.now()-started)/1000,error:error.name,httpStatus:error.status??null,message:String(error.message).replaceAll(env.CREATOR_MODEL_API_KEY!,'[REDACTED]')});}
}
await writeFile(new URL('./schema-probe.json',import.meta.url),JSON.stringify({model:env.CREATOR_MODEL_NAME,sessionReused:true,results},null,2));
console.log(JSON.stringify(results));
