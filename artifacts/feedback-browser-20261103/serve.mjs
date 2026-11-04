import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createServer as createViteServer} from '../../packages/creator/node_modules/vite/dist/node/index.js';
import react from '../../packages/creator/node_modules/@vitejs/plugin-react/dist/index.js';
import tailwind from '../../packages/creator/node_modules/@tailwindcss/vite/dist/index.mjs';
import {createCreatorDockVitePlugin} from '../../packages/creator/dist/dock/vite.js';
import {ensureManagedOperator} from '../../packages/creator/dist/operator/src/install.mjs';
import {installOfficialAgentUIResource} from '../../packages/creator/dist/operator/dist/runtime/operator-runtime.mjs';
import deliveries from '../../packages/plugins/src/catalog/plugin-delivery.json' with {type:'json'};
const repo=fileURLToPath(new URL('../../',import.meta.url));
const evidence=fileURLToPath(new URL('./',import.meta.url));
const previous=process.argv.includes('--reuse')?JSON.parse(await readFile(path.join(evidence,'state.json'),'utf8')):undefined;
const root=previous?.root??await mkdtemp(path.join(evidence,'host-'));
const creatorPort=47833, hostPort=5191;
const state=previous??{scope:'Latest rebuilt Creator; isolated React producer; local controlled AG-UI and feedback HTTP service; real browser actions',root,creatorUrl:`http://127.0.0.1:${creatorPort}`,hostUrl:`http://127.0.0.1:${hostPort}`,feedback:[],runs:[],errors:[],installation:null,restart:null};
const persist=()=>writeFile(path.join(evidence,'state.json'),JSON.stringify(state,null,2));
if(!previous)await promisify(execFile)(process.execPath,[path.join(repo,'packages/creator/operator/tests/support/prepare-host.mjs'),root,repo,'platform'],{maxBuffer:4e6});
await ensureManagedOperator(root);
await writeFile(path.join(root,'index.html'),'<html lang="zh-CN"><head><meta charset="UTF-8"><title>消息反馈 · 浏览器验收</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>');
await writeFile(path.join(root,'src/main.tsx'),`import {createRoot} from "react-dom/client";import {Agent} from "./agent-ui";import "./host.css";
const report=(message)=>fetch('/__feedback-check/error',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});
window.addEventListener('error',event=>report(event.message));window.addEventListener('unhandledrejection',event=>report(String(event.reason)));
createRoot(document.getElementById('root')).render(<Agent endpoint="http://127.0.0.1:${hostPort}/agent" feedback={{url:"http://127.0.0.1:${hostPort}/feedback"}} onError={error=>report(error.message)}/>);`);
await writeFile(path.join(root,'src/host.css'),'html,body,#root{margin:0;width:100%;height:100%}#root{height:100dvh}');
let cli,server;
async function startCreator(){
 const child=spawn(process.execPath,[path.join(repo,'packages/creator/dist/cli.js'),'--project',root,'--config-root',root,'--port',String(creatorPort),'--no-open'],{cwd:root,env:{...process.env,CREATOR_AGENT_MODE:'echo',CREATOR_VERIFICATION_MODE:'static_only',CREATOR_HOT_RELOAD:'false'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 let log='';
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Creator startup timeout: '+log)),20000);
  child.stdout.on('data',chunk=>{log+=chunk;if(log.includes(state.creatorUrl)){clearTimeout(timer);resolve();}});
  child.stderr.on('data',chunk=>{log+=chunk;});
  child.once('exit',code=>{clearTimeout(timer);reject(new Error('Creator exited '+code+': '+log));});
 });
 return child;
}
async function stopCreator(child){if(!child||child.exitCode!==null)return;const exit=once(child,'exit');child.disconnect();await exit;}
cli=await startCreator();const oldPid=cli.pid;await stopCreator(cli);cli=await startCreator();
state.restart={previousPid:oldPid,currentPid:cli.pid,samePort:true,completed:true};
function json(response,status,value){response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(value));}
const page=body=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>消息反馈安装验收</title><style>body{font:16px system-ui;max-width:850px;margin:60px auto;line-height:1.7}button,a{font:inherit;padding:12px 20px}pre{white-space:pre-wrap}</style>${body}</html>`;
server=await createViteServer({root,configFile:false,plugins:[react(),tailwind(),createCreatorDockVitePlugin({creatorUrl:state.creatorUrl,projectRoot:root,locale:'zh-CN'}),{name:'feedback-browser-evidence',configureServer(vite){vite.middlewares.use(async(request,response,next)=>{
 const route=request.url?.split('?')[0];
 if(!['/check.html','/__feedback-check/install','/__feedback-check/state','/__feedback-check/error','/agent','/feedback'].includes(route)){next();return;}
 try{
  if(route==='/check.html'){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(page('<h1>消息反馈安装验收</h1><p>临时测试项目；安装按钮调用重建后的官方资源安装器。</p><form action="/__feedback-check/install" method="POST"><button>安装消息反馈资源</button></form><p><a href="/">打开 Agent UI 与 Creator</a></p>'));return;}
  if(route==='/__feedback-check/state'){const model=JSON.parse(await readFile(path.join(root,'src/agent-ui/app-ui.json'),'utf8'));const plugins=[];const walk=v=>{if(!v||typeof v!=='object')return;if(v.pluginId)plugins.push(v);Object.values(v).forEach(c=>Array.isArray(c)?c.forEach(walk):walk(c));};walk(model);json(response,200,{...state,feedbackInstances:plugins.filter(p=>p.pluginId==='feedback-actions')});return;}
  const chunks=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));const body=Buffer.concat(chunks).toString();
  if(route==='/__feedback-check/install'){
   const result=await installOfficialAgentUIResource(root,'message-feedback',{runPackages:async()=>{throw new Error('Unexpected package installation')}});
   state.installation={resourceId:result.resourceId,changed:result.changed,verification:result.verification?.status??'ready',at:new Date().toISOString()};await persist();
   response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(page('<h1>消息反馈资源安装成功</h1><p>官方安装器返回 ready，组合校验通过；现有复制、重新生成和导出操作保留。</p><p><a href="/">打开 Agent UI 与 Creator</a></p>'));return;
  }
  const input=JSON.parse(body||'{}');
  if(route==='/__feedback-check/error'){state.errors.push(input);await persist();json(response,200,{ok:true});return;}
  if(route==='/feedback'){state.feedback.push({...input,receivedAt:new Date().toISOString()});await persist();response.writeHead(204);response.end();return;}
  if(route==='/agent'){
   state.runs.push({threadId:input.threadId,runId:input.runId,messages:input.messages});await persist();response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
   const messageId='feedback-answer-'+input.runId;const event=value=>response.write('data: '+JSON.stringify(value)+'\n\n');
   event({type:'RUN_STARTED',threadId:input.threadId,runId:input.runId});event({type:'TEXT_MESSAGE_START',messageId,role:'assistant'});event({type:'TEXT_MESSAGE_CONTENT',messageId,delta:'这是一条用于验证消息反馈的本地测试回复。请点击有帮助或没有帮助。'});event({type:'TEXT_MESSAGE_END',messageId});event({type:'RUN_FINISHED',threadId:input.threadId,runId:input.runId});response.end();return;
  }
 }catch(error){state.errors.push({message:error.message,code:error.code});await persist();json(response,500,{error:error.message,code:error.code});}
 });}}],resolve:{dedupe:['react','react-dom']},optimizeDeps:{noDiscovery:false,include:['react','react-dom/client','@za38.03/agent-ui-plugins','@za38.03/agent-ui-plugins/lexical',...new Set(deliveries.map(delivery=>'@za38.03/agent-ui-plugins/'+delivery.supportEntry)),'@za38.03/agent-ui-runtime','@za38.03/agent-ui-core','@za38.03/agent-ui-renderer','@assistant-ui/react-lexical','lexical','lucide-react','zustand','zod']},server:{host:'127.0.0.1',port:hostPort,strictPort:true,hmr:false,fs:{allow:[root,repo]}}});
await server.listen();await persist();console.log(JSON.stringify({ready:true,...state.restart,url:state.hostUrl+'/check.html',root}));
let stopping=false;async function stop(){if(stopping)return;stopping=true;await server.close();await stopCreator(cli);await persist();}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
