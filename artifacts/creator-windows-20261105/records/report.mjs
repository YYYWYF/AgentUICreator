import {readdir,readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const base=path.dirname(fileURLToPath(import.meta.url));
const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const optional=async file=>readJson(file).catch(()=>undefined);
const checks=await readJson(path.join(base,'checks.json'));
async function hashes(root,dir=path.join(root,'src')){
 const result={};for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())Object.assign(result,await hashes(root,file));else if(entry.isFile())result[path.relative(root,file).split(path.sep).join('/')]=createHash('sha256').update(await readFile(file)).digest('hex');}return result;
}
const scenarios=[];
for(const entry of await readdir(base,{withFileTypes:true})){
 if(!entry.isDirectory()||!/^case\d/.test(entry.name))continue;
 const folder=path.join(base,entry.name);
 const environment=await optional(path.join(folder,'environment.json'));
 const result=await optional(path.join(folder,'result.json'));
 const setup=await optional(path.join(folder,'harness-error.json'));
 const requests=await optional(path.join(folder,'model-http-requests.json'))??[];
 const before=await optional(path.join(folder,'before-hashes.json'));
 const retained=await access(path.join(folder,'host/src')).then(()=>true,()=>false);
 const after=retained?await hashes(path.join(folder,'host')):undefined;
 const independentlyChangedPaths=before&&after?[...new Set([...Object.keys(before),...Object.keys(after)])].filter(file=>before[file]!==after[file]):undefined;
 scenarios.push({folder,caseId:environment?.caseId,outputBudget:Number(environment?.output),status:result?.status??setup?.status??'RUNNING',seconds:result?.seconds??setup?.seconds,toolCalls:result?.toolCalls,changedPaths:result?.changedPaths,independentlyChangedPaths,interaction:result?.interaction??'not-run',errors:result?.runErrors??(result?.creatorError?[result.creatorError]:setup?[setup.message]:[]),nativeTerminalEvent:result?.nativeTerminalEvent,qaApprovals:result?.qaApprovals?.length,modelRequests:requests.length,httpFailures:requests.filter(item=>item.status&&item.status!==200).length,missingUsage:requests.filter(item=>!item.usage).length,usage:requests.reduce((sum,item)=>({input:sum.input+(item.usage?.prompt_tokens??0),output:sum.output+(item.usage?.completion_tokens??0),total:sum.total+(item.usage?.total_tokens??0)}),{input:0,output:0,total:0}),cleanup:await optional(path.join(folder,'cleanup.json'))});
}
const report={generated:new Date().toISOString(),...checks,logStress:await optional(path.join(base,'log-stress.json')),scenarios,interpretation:'Provider connectivity and tool/reasoning transport passed. Local tests have two failures. Real-model feature acceptance has not passed; distinguish setup failures, native run failures and QA termination after a worker crash. A 16k output budget has no demonstrated benefit because the Creator worker crashed on Windows log replacement before implementation. Input includes cache and output includes reasoning; token counts are not added twice. No product source changes were made.'};
await writeFile(path.join(base,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({report:path.join(base,'report.json'),scenarios:scenarios.map(item=>({caseId:item.caseId,outputBudget:item.outputBudget,status:item.status,seconds:item.seconds,toolCalls:item.toolCalls,changedFiles:item.independentlyChangedPaths?.length??item.changedPaths?.length,httpFailures:item.httpFailures}))}));
