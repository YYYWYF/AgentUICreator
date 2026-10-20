/** Real Creator, configured model, actual source takeover and update-page merge. */
import assert from "node:assert/strict";
import {cp,mkdir,mkdtemp,readFile,writeFile,rm,rename,symlink} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {spawn,execFile} from "node:child_process";
import {promisify} from "node:util";
import {spawnPnpm} from "./pnpm-process.mjs";
import {createLocalReleaseRegistry} from "./support/local-release-registry.mjs";
import {resourcePackageInvocation} from "../packages/operator/src/project/ensure-resource-packages.js";
import {runUpdateCommand} from "../packages/operator/src/updates/npm-artifact.js";
import {createConnectionHostFixture} from "../apps/creator-workbench/tests/support/agent-connection-host.js";
const repo=fileURLToPath(new URL("..",import.meta.url));
const output=process.argv[3] ? path.resolve(process.argv[3]) : path.join(repo,"docs/verification/creator-real-npm-update-2026-10-18/npm-only");await mkdir(output,{recursive:true});
const releases=JSON.parse(await readFile(process.argv[2]!,"utf8"));
const archives=releases.files.map((name:string)=>path.join(releases.archives,name));
const officialArchives=JSON.parse(await readFile(process.argv[4]!,"utf8"));
const registry=await createLocalReleaseRegistry(repo,[...officialArchives,...archives]);
process.env.CREATOR_UPDATE_MANIFEST_URL=registry.url+"/compatibility.json";
const installed=path.join(releases.root,"0.0.1/packages/plugins");
let initialManifest:string,initialLock:string;
const host=await createConnectionHostFixture({liveModel:true,pluginsPackageRoot:installed,prepareHost:async root=>{
 const manifest=JSON.parse(await readFile(path.join(root,"package.json"),"utf8"));
 delete manifest.devDependencies.tsx; // The Host scripts do not use tsx; avoid adding an unrelated tool dependency.
 manifest.packageManager="npm@"+(await runUpdateCommand(root,"npm",["--version"])).trim();
 for(const field of ["dependencies","devDependencies"]){for(const name of Object.keys(manifest[field]??{})){
  manifest[field][name]=name.startsWith("@za38.03/agent-ui-")?"0.0.1":JSON.parse(await readFile(path.join(root,"node_modules",name,"package.json"),"utf8")).version;
 }}
 await writeFile(path.join(root,"package.json"),JSON.stringify(manifest,null,2));
 await rm(path.join(root,"pnpm-workspace.yaml"),{force:true});await rm(path.join(root,"node_modules"),{recursive:true,force:true});
 await writeFile(path.join(root,".npmrc"),`registry=${registry.url}\naudit=false\nfund=false\n`);
 console.log("REAL_NPM_INITIAL_INSTALL",root);await new Promise<void>((resolve,reject)=>{const call=resourcePackageInvocation("npm",["install","--ignore-scripts","--fetch-retries=0","--logs-max=5000"]);const child=spawn(call.command,call.args,{cwd:root,shell:call.shell,stdio:["ignore","pipe","pipe"]});let installLog="";child.stdout.on("data",c=>installLog+=c);child.stderr.on("data",c=>installLog+=c);child.once("error",reject);child.once("close",async code=>{try{await writeFile(path.join(output,"initial-npm-install.log"),installLog);code===0?resolve():reject(Error(`REAL_NPM_INITIAL_INSTALL_FAILED_${code}`));}catch(error){reject(error);}});});
 initialManifest=await readFile(path.join(root,"package.json"),"utf8");initialLock=await readFile(path.join(root,"package-lock.json"),"utf8");
 console.log("REAL_NPM_INITIAL_INSTALL_COMPLETE",registry.stats());
}});
const require=createRequire(path.join(repo,"apps/creator-workbench/package.json"));const {chromium}=require("@playwright/test");
const runs:any[]=[],errors:string[]=[],upgradeResponses:any[]=[];
const composerRoot=path.join(host.hostRoot,"src/agent-ui/plugins/composer");
const appPath=path.join(composerRoot,"index.tsx"),definitionPath=path.join(composerRoot,"definition.ts"),ownershipPath=path.join(host.hostRoot,".agent-ui/plugin-ownership.json");
const modelPath=path.join(host.hostRoot,"src/agent-ui/app-ui/app-ui.json");const modelBefore=await readFile(modelPath);
const digest=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
let browser:any,page:any,browserServer:any;
async function exists(file:string){return readFile(file).then(()=>true,()=>false)}
async function savedJson(name:string,value:unknown){await writeFile(path.join(output,name),JSON.stringify(value,null,2));}
async function shot(name:string){await page.screenshot({path:path.join(output,name),fullPage:true});await writeFile(path.join(output,name.replace(/\.png$/, ".txt")),await page.locator("body").innerText());}
async function waitComplete(label:string,previous:number,question?:()=>Promise<void>){
 const deadline=Date.now()+15*60*1000;let last=0;let answered=0;
 while(Date.now()<deadline){
  if(runs.length>previous&&['"code":"ACTION_SELECTION_FAILED"','"code":"MODEL_TOOL_PROTOCOL_ERROR"'].some(code=>runs.at(-1)?.response.includes(code)))return;
  const pending=page.locator('.creator-question-card[data-status="pending"]');
  if(await pending.count()){
   if(!question||answered>=3)throw Error(`${label}: unexpected question: ${await pending.innerText()}`);
   await question();answered++;
  }
  const input=page.locator("#creator-request");
  if(runs.length>previous&&await input.count()&&!await input.isDisabled()&&!await pending.count())return;
  if(Date.now()-last>30000){await shot(`${label}-working.png`);console.log("LIVE_PROGRESS",label,(await page.locator("body").innerText()).slice(-450));last=Date.now();}
  await page.waitForTimeout(1200);
 }
 throw Error(`${label} timed out`);
}
async function request(text:string){const input=page.locator("#creator-request");await input.fill(text);await page.getByRole("button",{name:"发送",exact:true}).click();}
async function retrySelector(label:string, previous:number, question?:()=>Promise<void>) {
 for(let attempt=0;attempt<3;attempt++) {
  await waitComplete(label,previous,question);
  const last=runs.at(-1);
  if(!['"code":"ACTION_SELECTION_FAILED"','"code":"MODEL_TOOL_PROTOCOL_ERROR"'].some(code=>last?.response.includes(code)))return;
  await shot(`${label}-selector-retry-${attempt+1}.png`);
  let prompt=last.request.messages.filter((message:any)=>message.role==="user").at(-1).content;
  const dismiss=page.getByRole("button",{name:"放弃本次任务",exact:true});
  if(await dismiss.isVisible()){await dismiss.click();await shot(`${label}-dismiss-protocol-failure-${attempt+1}.png`);}
  if(label==="05-takeover"&&await exists(ownershipPath))prompt="接管已成功，我已同意本工程托管 composer。请继续修改已经接管的 source/adapters/composer.tsx：把整个 leadingActions/trailingActions/submitAction 操作栏的真实 JSX 放在输入框上方，附件和队列保持原位。不使用 CSS order，不再次接管，不修改薄应用层和 AppUIModel。保留浅紫色背景、12px 内边距、20px 圆角及所有 Slots，最后验证。";
  console.log("REAL_MODEL_REQUEST_RETRY",label,attempt+1);
  previous=runs.length;await request(prompt);
 }
 throw Error(`${label}: real model selector retries exhausted`);
}
const runtimeVerdicts:any[]=[];
async function assertRuntimePassed(label:string) {
 const events=runs.at(-1).response.split("\n").filter((line:string)=>line.startsWith("data: ")).map((line:string)=>JSON.parse(line.slice(6)));
 const final=events.findLast((event:any)=>event.type==="RUN_FINISHED");
 const verdict=final?.result?.receipt?.verification;
 runtimeVerdicts.push({phase:label,verification:verdict});
 await savedJson("runtime-completion-verdicts.json",runtimeVerdicts);
 assert.equal(verdict?.status,"changed-and-verified",`${label}: automatic completion must be verified`);
 assert.equal(verdict.checks.find((check:any)=>check.id==="runtime-verification")?.status,"passed");
}
async function checks(){for(const name of ["verify:ui","typecheck","build"]){const log=await runUpdateCommand(host.hostRoot,"npm",["run",name]);await writeFile(path.join(output,`final-${name.replace(":","-")}.log`),log);}}

try{
 console.log("LIVE_CREATOR",JSON.stringify({creatorOrigin:host.creatorOrigin,hostOrigin:host.hostOrigin,root:host.hostRoot}));
 browserServer=await chromium.launchServer({headless:true,...(process.platform==="darwin"?{executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}:{})});
 await savedJson("live-session.json",{webSocket:browserServer.wsEndpoint(),hostRoot:host.hostRoot,creatorOrigin:host.creatorOrigin,hostOrigin:host.hostOrigin});
 browser=await chromium.connect(browserServer.wsEndpoint());
 page=await browser.newPage({viewport:{width:1840,height:1500},deviceScaleFactor:1});page.setDefaultTimeout(60000);
 page.on("pageerror",(error:Error)=>{errors.push(error.message);console.log("PAGE_ERROR",error.message)});
 page.on("response",async(response:any)=>{const pathname=new URL(response.url()).pathname;
  if(pathname==="/__creator/run")try{runs.push({request:JSON.parse(response.request().postData()||"{}"),response:await response.text()});await savedJson("creator-runs.json",runs);console.log("MODEL_RUN_FINISHED",runs.length);}catch{}
  if(pathname.startsWith("/__creator/updates/"))try{upgradeResponses.push({route:pathname,status:response.status(),body:await response.json()});await savedJson("update-responses.json",upgradeResponses);}catch{}
 });
 await page.goto(host.creatorOrigin);await page.locator("#creator-request").waitFor({state:"visible",timeout:180000});
 const separator=page.getByRole("separator");if(await separator.count()){await separator.focus();for(let i=0;i<18;i++)await separator.press("ArrowLeft");}
 const preview=page.frameLocator('iframe[title="Host Application"]');
 const composer=preview.locator('[data-plugin-instance-id="composer-main"]');await composer.locator('[data-slot="aui_composer-input"]').waitFor({timeout:30000}).catch(async()=>{await page.reload();await composer.locator('[data-slot="aui_composer-input"]').waitFor({timeout:120000});});
 await shot("01-real-creator-before.png");
 const snapshot=async()=>{const result:Record<string,string>={};async function walk(dir:string){for(const entry of await (await import("node:fs/promises")).readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else result[path.relative(host.hostRoot,file).split(path.sep).join("/")]=digest(await readFile(file));}}await walk(path.join(host.hostRoot,"src"));return result;};const before=await snapshot();
 await page.getByRole("button",{name:"设置",exact:true}).click();await page.getByRole("button",{name:"插件更新",exact:true}).click();await page.getByRole("heading",{name:"更新中心",exact:true}).waitFor();await page.getByText("Composer 新增实时输入字数统计",{exact:false}).first().waitFor();await shot("01-online-actual-versions.png");
 await page.getByRole("button",{name:"校验产物并准备升级",exact:true}).click();await page.getByRole("button",{name:"确认升级依赖",exact:true}).waitFor({timeout:180000});await shot("02-verified-npm-plan.png");
 const promise=page.waitForResponse((r:any)=>new URL(r.url()).pathname.endsWith("/packages/execute"),{timeout:300000});await page.getByRole("button",{name:"确认升级依赖",exact:true}).click();await shot("03-npm-confirmed-installing.png");const result=await(await promise).json();assert.equal(result.status,"installed",JSON.stringify(result));
 await page.getByText("依赖已升级并通过验证。现在可以选择是否同步已托管源码。",{exact:true}).first().waitFor();await shot("04-real-npm-upgrade-complete.png");assert.deepEqual(await snapshot(),before);await checks();
 await savedJson("npm-only-verification.json",{realCreator:true,realNpmInstall:true,realModel:false,sourceSync:false,modelBlocker:"api_key_expired",result,sourceFilesUnchanged:true,registryStats:registry.stats(),lock:JSON.parse(await readFile(path.join(host.hostRoot,"package-lock.json"),"utf8")).packages["node_modules/@za38.03/agent-ui-plugins"]});
 console.log("REAL_CREATOR_NPM_UPGRADE_COMPLETE");

}catch(error){await page?.screenshot({path:path.join(output,"99-failed-state.png"),fullPage:true}).catch(()=>{});await savedJson("failure.json",{error:String(error),errors,hostRoot:host.hostRoot});await cp(composerRoot,path.join(output,"failed-composer"),{recursive:true}).catch(()=>{});console.log("LIVE_REVIEW_REQUIRED",String(error),browserServer?.wsEndpoint());await new Promise(()=>{});throw error;}
finally{await cp(path.join(host.hostRoot,".agent-ui/creator/logs"),path.join(output,"creator-logs"),{recursive:true}).catch(()=>{});await browser?.close();await browserServer?.close();await host.close();await registry.close();}
