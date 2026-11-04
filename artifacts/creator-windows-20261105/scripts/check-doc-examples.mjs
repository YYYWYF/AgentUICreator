import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../local-runs');
const root=path.join(base,'doc-example-project');
const require=createRequire(path.join(repo,'apps/creator-workbench/package.json'));
const ts=createRequire(path.join(repo,'package.json'))('typescript-ui-audit');
const text=await fs.readFile(path.join(repo,'website/docs/development/plugin-api.md'),'utf8');
const locale=text.slice(text.indexOf('## 主题与多语言'),text.indexOf('## 前端工具与宿主页面联动'));
const events=text.slice(text.indexOf('## 订阅业务事件'),text.indexOf('## 订阅业务事件')+5000);
const fences=s=>[...s.matchAll(/```(?:ts|tsx)\r?\n([\s\S]*?)```/g)].map(m=>m[1]);
const local=fences(locale),event=fences(events).find(s=>s.includes('export function SelectedTickets'));
if(local.length!==2||!event)throw Error('Expected current public documentation examples');
await fs.mkdir(root,{recursive:true});
try{await fs.symlink(path.join(repo,'apps/creator-workbench/node_modules'),path.join(root,'node_modules'),process.platform==='win32'?'junction':'dir');}catch(e){if(e.code!=='EEXIST')throw e;}
await fs.writeFile(path.join(root,'package.json'),JSON.stringify({type:'module'}));
const files=[['application/i18n/messages.ts',local[0]],['plugins/ticket-action/index.tsx',local[1]],['plugins/ticket-updates/index.tsx',event]];
for(const [file,content]of files){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),content);}
const program=ts.createProgram(files.map(([file])=>path.join(root,file)),{strict:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,baseUrl:repo,paths:{'@za38.03/agent-ui-plugins':['packages/plugins/dist/index.d.ts']}});
const diagnostics=ts.getPreEmitDiagnostics(program);
const format=ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'});
await fs.writeFile(path.join(base,'doc-examples.log'),format||'PASS: actual localization and component-event examples compile against installed public declarations.\n');
console.log(format||'PASS: 3 actual documentation snippets compile.');process.exitCode=diagnostics.length?1:0;
