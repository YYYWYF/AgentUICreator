/** Deterministic visual evidence: real Creator tool/question card and real Host
 * mutation, without a language model or changes to any user project. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const repo = fileURLToPath(new URL("..",import.meta.url));
const require = createRequire(path.join(repo,"apps/creator-workbench/package.json"));
const { chromium } = require("@playwright/test");
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const { default: tailwind } = await import(pathToFileURL(require.resolve("@tailwindcss/vite")).href);
const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")).href);
const { initializeAgentUIProject } = await import(pathToFileURL(path.join(repo,"packages/operator/dist/bootstrap/index.js")).href);
const { createAgentUIInitializationHost, handleUIOperatorRequest } = await import(pathToFileURL(path.join(repo,"packages/operator/dist/runtime/operator-runtime.mjs")).href);
const output = path.join(repo,"docs/verification/plugin-source-takeover-screenshots");
await mkdir(output,{recursive:true});
const fixture = await mkdtemp(path.join(repo,"apps/creator-workbench/.takeover-visual-"));
const project = path.join(fixture,"project");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
let server, browser, python;
try {
 await mkdir(project); await mkdir(path.join(project,"node_modules"));
 const template = JSON.parse(await readFile(path.join(repo,"packages/operator/tests/fixtures/project/package.json"),"utf8"));
 template.packageManager = "npm@11.19.0";
 template.scripts = { build: "node verify-build.mjs" };
 await writeFile(path.join(project,"package.json"),JSON.stringify(template));
 for (const name of Object.keys({...template.dependencies,...template.devDependencies})) {
  const target = path.join(project,"node_modules",name); await mkdir(path.dirname(target),{recursive:true});
  if(name === "@za38.03/agent-ui-plugins") {
   await mkdir(target); await cp(path.join(repo,"packages/plugins/dist"),path.join(target,"dist"),{recursive:true});
   await cp(path.join(repo,"packages/plugins/package.json"),path.join(target,"package.json"));
   await symlink(path.join(repo,"packages/plugins/node_modules"),path.join(target,"node_modules"),process.platform==="win32"?"junction":"dir");
  } else {
   const candidates=[...['operator','plugins','runtime','creator','core','renderer'].map(owner=>path.join(repo,"packages",owner,"node_modules",name)),...['creator-assistant-host','creator-host-sandbox'].map(host=>path.join(repo,"examples",host,"node_modules",name))];
   const source=candidates.find(existsSync); if(!source) throw Error(`Missing dependency ${name}`);
   await symlink(source,target,process.platform==="win32"?"junction":"dir");
  }
 }
 await mkdir(path.join(project,"src"));
 await initializeAgentUIProject({projectRoot:project,mode:"assistant",sourceRoot:"src/agent-ui"},createAgentUIInitializationHost());
 await writeFile(path.join(project,"verify-build.mjs"),`import {build} from 'vite'; import react from '@vitejs/plugin-react'; import tailwind from '@tailwindcss/vite'; import {writeFile} from 'node:fs/promises'; try { await build({configFile:false,plugins:[react(),tailwind()],resolve:{dedupe:['react','react-dom']},logLevel:'error',build:{write:false,lib:{entry:'src/agent-ui/application/Agent.tsx',formats:['es']}}}); } catch(error) { await writeFile(${JSON.stringify(path.join(output,'build-error.log'))},String(error.stack)); throw error; }`);
 const modelBefore=await readFile(path.join(project,"src/agent-ui/app-ui/app-ui.json"));
 let sourceBefore, ownershipBefore;
 async function snapshot() {
  const registry=await readFile(path.join(project,"src/agent-ui/plugins/registry.generated.ts"),"utf8");
  const metadata=await readFile(path.join(project,".agent-ui/plugin-ownership.json")).catch(error=>{if(error.code==='ENOENT')return null;throw error});
  const owned=metadata?JSON.parse(metadata).plugins.composer:null;
  const files=[];
  async function walk(dir,logical='') {for(const entry of await readdir(dir,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error})) {const relative=path.posix.join(logical,entry.name);if(entry.isDirectory())await walk(path.join(dir,entry.name),relative);else files.push(relative)}}
  await walk(path.join(project,"src/agent-ui/plugins/composer"));
  const source=owned?await readFile(path.join(project,"src/agent-ui/plugins/composer/adapters/composer.tsx")):null;
  return { pluginId:'composer', packageVersion:JSON.parse(await readFile(path.join(project,"node_modules/@za38.03/agent-ui-plugins/package.json"),'utf8')).version, ownership:owned?'project_source':'official_package',baseVersion:owned?.package.version??null,files:files.sort(),registry:registry.split('\n').filter(line=>line.includes('@za38.03/agent-ui-plugins/composer\"')||line.includes('./composer/definition\"')).join('\n'),modelUnchanged:(await readFile(path.join(project,"src/agent-ui/app-ui/app-ui.json"))).equals(modelBefore),sourceHash:source?hash(source):null,baseHash:metadata?hash(metadata):null,sourcePreserved:sourceBefore?source?.equals(sourceBefore):null,basePreserved:ownershipBefore?metadata?.equals(ownershipBefore):null };
 }
 const pythonScript=String.raw`
import asyncio,json,sys
from pathlib import Path
from typing import TypedDict
from langgraph.graph import StateGraph,START,END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from agent_ui_creator.domain_tools.operator_tools import create_operator_tools
from agent_ui_creator.operator import OperatorClient
class State(TypedDict,total=False):
 result:str
async def main():
 client=OperatorClient(project_root=Path(sys.argv[1]),timeout_seconds=300)
 selected=next(t for t in create_operator_tools(client) if t.name=='takeover_plugin_source')
 async def node(state):return {'result':await selected.ainvoke({'pluginId':'composer','locale':'zh-CN'})}
 builder=StateGraph(State);builder.add_node('takeover',node);builder.add_edge(START,'takeover');builder.add_edge('takeover',END)
 graph=builder.compile(checkpointer=InMemorySaver());config={'configurable':{'thread_id':'visual-evidence'}}
 while line:=await asyncio.to_thread(sys.stdin.readline):
  try:
   request=json.loads(line)
   result=await graph.ainvoke({} if request['action']=='start' else Command(resume={'answers':request['answers']}),config)
   if result.get('__interrupt__'):
    paused=result['__interrupt__'][0];response={'question':paused.value,'interruptId':paused.id}
   else:response={'result':json.loads(result['result'])}
   print(json.dumps(response,ensure_ascii=False),flush=True)
  except Exception as error:print(json.dumps({'error':str(error)}),flush=True)
asyncio.run(main())
`;
 python=spawn(path.join(repo,"packages/creator/python/.venv/bin/python"),['-u','-c',pythonScript,project],{cwd:path.join(repo,"packages/creator/python"),stdio:['pipe','pipe','pipe']});
 let stderr='';python.stderr.on('data',chunk=>{stderr+=chunk});
 const replies=[];const lines=createInterface({input:python.stdout});lines.on('line',line=>{console.log('Python reply',line.slice(0,400));replies.shift()?.(JSON.parse(line))});
 const request=payload=>new Promise((resolve,reject)=>{replies.push(resolve);python.stdin.write(JSON.stringify(payload)+'\n');python.once('exit',code=>{reject(Error('Python exited: '+code+' '+stderr))})});
 await writeFile(path.join(fixture,'index.html'),'<div id="root"></div><script type="module" src="/main.tsx"></script>');
 await writeFile(path.join(fixture,'main.tsx'),`
import {useState} from 'react'; import {createRoot} from 'react-dom/client';
import {CreatorQuestionCard} from '/@fs/${path.join(repo,'packages/creator/src/ui/CreatorQuestionCard.tsx').replaceAll('\\','/')}';
import {CreatorLocaleProvider} from '/@fs/${path.join(repo,'packages/creator/src/ui/i18n/locale.ts').replaceAll('\\','/')}';
import '/@fs/${path.join(repo,'packages/creator/src/ui/creator-workbench.css').replaceAll('\\','/')}'; import './visual.css';
function App(){const[state,setState]=useState(null),[question,setQuestion]=useState(null),[busy,setBusy]=useState(false),[phase,setPhase]=useState('默认通过 npm 使用插件');
async function run(action,answers){setBusy(true);try{const result=await(await fetch('/evidence/'+action,{method:'POST',body:JSON.stringify({answers})})).json();if(result.error)throw Error(result.error);setState(result.snapshot);if(result.question)setQuestion({kind:'question',id:'source-takeover',interruptId:result.interruptId,status:'pending',steps:result.question.steps});if(action==='answer'){setQuestion(q=>({...q,status:'resolved',answers}));setPhase('已确认：源码提取完成，引用切换为本地')}if(action==='start')setPhase('等待用户确认：尚未写入插件源码');if(action==='upgrade')setPhase('模拟 npm 升级后：本地源码和 BASE 保持不变');if(result.result&&!result.result.ok)throw Error(JSON.stringify(result.result));}catch(e){setPhase('错误：'+e.message)}finally{setBusy(false)}}
if(!state)fetch('/evidence/state').then(r=>r.json()).then(r=>setState(r.snapshot));
return <CreatorLocaleProvider locale="zh-CN"><div className="visual"><header><div><span className="tag">源码托管 · 实际链路演示</span><h1>Composer 插件接管过程</h1><p>真实 Creator 确认卡片 + 接管工具 + Operator；确定性触发，不使用大模型。临时工程，不修改你的业务工程。</p></div></header><div className="status" data-testid="phase">{busy?'正在执行真实工程校验…':phase}</div><main><section className="conversation"><h2>Creator</h2><div className="user-message">我需要修改 Composer 的实现，请先让我确认是否转为工程源码托管。</div>{question?<CreatorQuestionCard activity={question} onAnswer={a=>run('answer',a)} onAbandon={()=>run('answer',Object.fromEntries(question.steps.map(s=>[s.id,['decline']])))} />:<div className="initial"><p>当前从 npm 包引用；工程中没有 Composer 插件源码。</p><button onClick={()=>run('start')} disabled={busy}>准备接管计划</button></div>}{question?.status==='resolved'&&<p className="receipt">Host 构建通过，已保存精确版本的原始 BASE。Creator 后续优先修改本地适配代码。</p>}<button className="upgrade" disabled={busy||!state?.baseVersion} onClick={()=>run('upgrade')}>模拟替换为 npm 包 99.0.0</button><small>99.0.0 是验证用模拟版本，未发布 npm。</small></section><aside><h2>实时工程证据</h2>{state&&<><dl>{[['插件 ID',state.pluginId],['实现来源',state.ownership],['当前 npm 包',state.packageVersion],['本地 BASE 来源',state.baseVersion??'尚未接管'],['AppUIModel / 实例 / Slot',state.modelUnchanged?'保持原始字节不变':'发生变化']].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><h3>注册引用</h3><pre>{state.registry}</pre><h3>本地插件文件</h3><pre>{state.files.length?state.files.join('\\n'):'（尚不存在）'}</pre>{state.sourceHash&&<><h3>源码 / 基线摘要</h3><code>{state.sourceHash.slice(0,20)}…</code><br/><code>{state.baseHash.slice(0,20)}…</code></>}{state.sourcePreserved!==null&&<div className="preserved">本地源码：{state.sourcePreserved?'保持不变':'变化'}<br/>原始 BASE：{state.basePreserved?'保持不变':'变化'}</div>}</>}</aside></main><footer>演示范围：Composer · 当前安装版本提取 · 同 ID 本地注册 · 模拟 npm 包替换</footer></div></CreatorLocaleProvider>};createRoot(document.getElementById('root')).render(<App/>);
`);
 await writeFile(path.join(fixture,'visual.css'),`body{margin:0;background:#f6f7fb;color:#202632;font-family:Arial,"PingFang SC",sans-serif}.visual{max-width:1460px;margin:auto;padding:30px}header h1{font-size:29px;margin:10px 0}header p{color:#657084;font-size:14px}.tag{font-size:12px;color:#6b4ab5}.status{margin:24px 0 20px;padding:15px 20px;background:#ede9fa;border:1px solid #dbd0f5;border-radius:12px;color:#553a89;font-weight:600}main{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:24px}section,aside{padding:24px;background:white;border:1px solid #e1e5ee;border-radius:14px;min-width:0}h2{font-size:16px;margin:0 0 20px}h3{font-size:13px;margin-top:24px;color:#687288}.user-message{background:#f2f3f6;padding:14px 16px;border-radius:10px;font-size:14px;line-height:1.6;margin-bottom:20px}.initial{font-size:14px;padding:18px 0}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}.initial button,.upgrade{border:0;border-radius:8px;padding:10px 16px;color:white;background:#7653b7;font-size:13px}.upgrade{display:block;margin-top:24px}small{display:block;color:#858d9c;margin-top:9px;font-size:11px}.receipt,.preserved{font-size:14px;background:#edf8ef;color:#27623a;padding:15px;border-radius:9px;line-height:1.7}dl{font-size:13px}dl div{display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid #eef0f5;padding:12px 0}dt{color:#6c7587}dd{margin:0;font-weight:600}pre{font-size:11px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f6fa;padding:14px;border-radius:8px}code{font-size:12px;color:#6d7482}footer{padding:24px 0;color:#818b9c;font-size:12px}.creator-question-card{margin:0} .creator-question-card p{overflow-wrap:anywhere}`);
 server=await createServer({configFile:false,root:fixture,plugins:[react(),tailwind(),{name:'real-takeover-evidence',configureServer(vite){vite.middlewares.use('/evidence',async(req,res)=>{try{const action=req.url.split('?')[0].slice(1);console.log('API',action);let chunks='';for await(const chunk of req)chunks+=chunk;const payload=chunks?JSON.parse(chunks):{};let result={};if(action==='start'||action==='answer')result=await request({action,answers:payload.answers});if(action==='upgrade'){const before=await snapshot();sourceBefore=await readFile(path.join(project,'src/agent-ui/plugins/composer/adapters/composer.tsx'));ownershipBefore=await readFile(path.join(project,'.agent-ui/plugin-ownership.json'));const installed=path.join(project,'node_modules/@za38.03/agent-ui-plugins');for(const file of ['package.json','dist/catalog.json']){const data=JSON.parse(await readFile(path.join(installed,file),'utf8'));if(file==='package.json')data.version='99.0.0';else data.package.version='99.0.0';await writeFile(path.join(installed,file),JSON.stringify(data))}const sync=await handleUIOperatorRequest({operation:'synchronize_plugin_registry',input:{expectedSourceHash:hash(await readFile(path.join(project,'src/agent-ui/plugins/registry.generated.ts')))}},project);assert(sync.ok,JSON.stringify(sync));assert.equal((await snapshot()).sourceHash,before.sourceHash)}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...result,snapshot:await snapshot()}))}catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}))}})}}],server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[repo]}},optimizeDeps:{noDiscovery:true,include:["react","react-dom/client","react"]},resolve:{dedupe:['react','react-dom']}});
 await server.listen();
 const chrome = process.env.AGENT_UI_TEST_CHROME_PATH ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
 browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{})});
 const page=await browser.newPage({viewport:{width:1560,height:1200},deviceScaleFactor:1});
 page.setDefaultTimeout(20000);page.on('console',message=>{if(message.type()==='error')console.log('Browser error',message.text())});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(server.resolvedUrls.local[0]);await page.getByText('official_package',{exact:true}).waitFor();
 await page.screenshot({path:path.join(output,'01-package-reference.png'),fullPage:true});
 await page.getByRole('button',{name:'准备接管计划'}).click();await page.getByRole('radio').first().waitFor({timeout:30000});
 const before=await snapshot();assert.equal(before.ownership,'official_package');assert.equal(before.files.length,0);
 await page.screenshot({path:path.join(output,'02-confirmation.png'),fullPage:true});
 console.log('Selecting approval');await page.getByRole('radio').first().check();console.log('Submitting approval');await page.getByRole('button',{name:'确认选择',exact:true}).click();
 await Promise.race([page.getByText('project_source',{exact:true}).waitFor({timeout:120000}),page.getByTestId('phase').filter({hasText:'错误：'}).waitFor({timeout:120000}).then(async()=>{throw Error(await page.getByTestId('phase').innerText())})]);
 await page.screenshot({path:path.join(output,'03-local-source.png'),fullPage:true});
 const adopted=await snapshot();assert(adopted.modelUnchanged);assert(adopted.registry.includes('./composer/definition'));assert.equal(adopted.files.length,6);
 await page.getByRole('button',{name:'模拟替换为 npm 包 99.0.0'}).click();await page.getByText('99.0.0',{exact:true}).waitFor();await page.getByText('本地源码：保持不变').waitFor();
 await page.screenshot({path:path.join(output,'04-after-package-upgrade.png'),fullPage:true});
 const upgraded=await snapshot();assert(upgraded.sourcePreserved&&upgraded.basePreserved&&upgraded.modelUnchanged);assert.deepEqual(errors,[]);
 await writeFile(path.join(output,'evidence.json'),JSON.stringify({mode:'deterministic-real-tool-and-CreatorQuestionCard-no-LLM',before,adopted,upgraded,browserErrors:errors,projectWasTemporary:true},null,2));
 console.log(output);
} finally {python?.stdin.end();python?.kill();await browser?.close();await server?.close();await rm(fixture,{recursive:true,force:true});}
