/** Real Creator, configured model, actual source takeover and update-page merge. */
import assert from "node:assert/strict";
import {cp,mkdir,mkdtemp,readFile,writeFile,rm,rename,symlink} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {spawnPnpm} from "./pnpm-process.mjs";
import {createConnectionHostFixture} from "../apps/creator-workbench/tests/support/agent-connection-host.js";
const repo=fileURLToPath(new URL("..",import.meta.url));
const output=process.argv[3] ? path.resolve(process.argv[3]) : path.join(repo,"docs/verification/creator-live-final-acceptance-2026-10-17");await mkdir(output,{recursive:true});
const releases=JSON.parse(await readFile(process.argv[2]!,"utf8"));
const archives=releases.files.map((name:string)=>path.join(releases.archives,name));
const temp=await mkdtemp(path.join(tmpdir(),"creator-live-installed-"));
const installed=path.join(temp,"plugins");
const python=path.join(repo,"packages/creator/python/.venv",...(process.platform==="win32"?["Scripts","python.exe"]:["bin","python"]));
async function install(archive:string){
 const extracted=await mkdtemp(path.join(temp,"extract-"));
 await promisify(execFile)(python,["-c","import tarfile,sys; tarfile.open(sys.argv[1]).extractall(sys.argv[2],filter='data')",archive,extracted]);
 await rm(installed,{recursive:true,force:true});await rename(path.join(extracted,"package"),installed);
 await symlink(path.join(repo,"packages/plugins/node_modules"),path.join(installed,"node_modules"),process.platform==="win32"?"junction":"dir");
}
await install(archives.find((file:string)=>file.endsWith("-0.0.1.tgz"))!);
const host=await createConnectionHostFixture({liveModel:true,pluginsPackageRoot:installed});
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
async function checks(){for(const name of ["verify:ui","typecheck","build"]){await new Promise<void>((resolve,reject)=>{let log="";const child=spawnPnpm(["run",name],{cwd:host.hostRoot,stdio:["ignore","pipe","pipe"]});child.stdout.on("data",chunk=>log+=chunk);child.stderr.on("data",chunk=>log+=chunk);child.once("error",reject);child.once("close",code=>{void writeFile(path.join(output,`final-${name.replace(":","-")}.log`),log);code===0?resolve():reject(Error(`${name}: ${log.slice(-2000)}`));});});}}
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
 const composer=preview.locator('[data-plugin-instance-id="composer-main"]');await composer.locator('[data-slot="aui_composer-input"]').waitFor({timeout:180000});
 await shot("01-real-creator-before.png");
 const propsPrompt="请实际修改主 Composer：仅在用户本地的薄应用层 plugins/composer/index.tsx，通过公开组件的 rootProps.style 设置 padding:12、borderRadius:20、backgroundColor:'#f3e8ff'。保留其他 props 和全部插槽。不要改 AppUIModel、不要改 npm 包实现、不要接管源码。这些是公开属性支持的普通应用层定制。请验证实际预览生效。";
 await request(propsPrompt);await shot("02-props-request.png");await retrySelector("03-props",0);await assertRuntimePassed("props");
 assert.equal(await exists(ownershipPath),false,"Props edit must not take over source");assert.equal(await exists(path.join(composerRoot,"source/index.tsx")),false);
 const appAfterProps=await readFile(appPath,"utf8");assert(appAfterProps.includes("rootProps"));
 const style=await composer.locator("form").evaluate((el:HTMLElement)=>({padding:getComputedStyle(el).padding,background:getComputedStyle(el).backgroundColor,radius:getComputedStyle(el).borderRadius}));
 assert.equal(style.padding,"12px");assert.equal(style.radius,"20px");await savedJson("props-proof.json",{style,application:appAfterProps,ownershipAbsent:true});
 await shot("04-props-visible-no-takeover.png");
 const previous=runs.length;
 await request("请修改 composer 插件实现的内部真实 DOM 顺序：将整个操作工具栏 leadingActions/trailingActions/submitAction 放在文本输入框上方，附件和队列保持原位。不能只用 CSS order 视觉挪动，也不要新建替代插件或复制一套实现。如果公开 props/组合不能直接改变这个内部顺序，请直接单独调用 takeover_plugin_source，由工具内置的确认卡片询问我是否接管；不要提前用 ask_user_question 重复询问。得到确认再提取并优先修改 source/adapters。保留刚才薄应用层的浅紫色背景、内边距、圆角及原有实例 ID 和 Slots，最后验证预览。");
 await retrySelector("05-takeover",previous,async()=>{
  const question=page.locator('.creator-question-card[data-status="pending"]');
  assert.equal(await exists(ownershipPath),false);await question.scrollIntoViewIfNeeded();await shot("06-real-takeover-question.png");
  const text=await question.innerText();assert(/源码|托管/.test(text));assert(!text.includes("planHash")&&!text.includes("plugins/composer"));
  await question.getByRole("radio",{name:/同意.*源码|同意.*托管|确认.*接管|Manage source/i}).first().check();await shot("07-user-approves-source.png");
  await question.getByRole("button",{name:"确认选择",exact:true}).click();
 });
 await assertRuntimePassed("takeover");
 await savedJson("takeover-proof.json",{application:await readFile(appPath,"utf8"),ownership:JSON.parse(await readFile(ownershipPath,"utf8"))});
 assert(await exists(ownershipPath));const appAfterTakeover=await readFile(appPath);const defAfterTakeover=await readFile(definitionPath);
 assert.equal(appAfterTakeover.toString(),appAfterProps.replace("@za38.03/agent-ui-plugins/composer","./source/index"));
 const geometry=async()=>({actions:await composer.locator('[data-slot="aui_composer-actions"]').boundingBox(),input:await composer.locator('[data-slot="aui_composer-input"]').boundingBox()});
 const adoptedGeometry=await geometry();assert(adoptedGeometry.actions!.y+adoptedGeometry.actions!.height<=adoptedGeometry.input!.y);
 await shot("08-local-source-customization-visible.png");
 const ownershipBeforeUpgrade=await readFile(ownershipPath);const implementationBefore=await readFile(path.join(composerRoot,"source/adapters/composer.tsx"));
 await install(archives.find((file:string)=>file.endsWith("-0.0.2.tgz"))!);
 const pkgFile=path.join(host.hostRoot,"package.json");const pkg=JSON.parse(await readFile(pkgFile,"utf8"));pkg.dependencies["@za38.03/agent-ui-plugins"]=`file:${archives.find((file:string)=>file.endsWith("-0.0.2.tgz"))}`;await writeFile(pkgFile,JSON.stringify(pkg,null,2));
 assert((await readFile(appPath)).equals(appAfterTakeover));assert((await readFile(ownershipPath)).equals(ownershipBeforeUpgrade));assert((await readFile(path.join(composerRoot,"source/adapters/composer.tsx"))).equals(implementationBefore));
 await savedJson("upgrade-before-sync.json",{installedVersion:"0.0.2",applicationHash:digest(appAfterTakeover),ownershipUnchanged:true,implementationUnchanged:true,archives});
 // Use the real menu and update page, not a replacement page or intercepted API.
 const more=page.getByRole("button",{name:"设置",exact:true});await more.click();
 await page.getByRole("button",{name:"插件更新",exact:true}).click();
 await page.getByRole("button",{name:"同步实现源码",exact:true}).waitFor({state:"visible",timeout:120000});await shot("09-real-updates-page.png");
 await page.getByRole("button",{name:"同步实现源码",exact:true}).click();await page.getByRole("button",{name:"使用模型合并",exact:true}).waitFor();await shot("10-source-sync-plan.png");
 const conflictPlan=upgradeResponses.findLast((response:any)=>response.route.endsWith("/plan"))?.body;
 assert.equal(conflictPlan?.requiresMerge,true,"Update plan must require real merge");
 await savedJson("conflict-proof.json",conflictPlan);
 const beforeMergeRuns=runs.length;await page.getByRole("button",{name:"使用模型合并",exact:true}).click();await retrySelector("11-model-merge",beforeMergeRuns);await assertRuntimePassed("source-merge");
 assert((await readFile(appPath)).equals(appAfterTakeover));await shot("11b-real-model-merge-complete.png");
 // Model completes editing; the user adopts the validated baseline from Updates.
 await page.getByRole("button",{name:"设置",exact:true}).click();await page.getByRole("button",{name:"插件更新",exact:true}).click();
 await page.getByRole("button",{name:"我已完成合并：验证并推进基线",exact:true}).waitFor({state:"visible",timeout:120000});await shot("12-merged-awaiting-validation.png");
 await page.getByRole("button",{name:"我已完成合并：验证并推进基线",exact:true}).click();
 await page.getByText("插件更新完成，验证通过。",{exact:true}).first().waitFor({state:"visible",timeout:180000});await shot("13-source-sync-complete.png");
 assert((await readFile(appPath)).equals(appAfterTakeover));assert((await readFile(definitionPath)).equals(defAfterTakeover));assert((await readFile(modelPath)).equals(modelBefore));
 await composer.locator('[data-slot="aui-composer-character-count"]').waitFor({state:"visible",timeout:120000});
 const finalGeometry=await geometry();assert(finalGeometry.actions!.y+finalGeometry.actions!.height<=finalGeometry.input!.y);
 const finalStyle=await composer.locator("form").evaluate((el:HTMLElement)=>({padding:getComputedStyle(el).padding,background:getComputedStyle(el).backgroundColor,radius:getComputedStyle(el).borderRadius}));assert.deepEqual(finalStyle,style);
 const draftText="保留应用层，合并新功能";
 await composer.getByRole("textbox").fill(draftText);
 await assert.doesNotReject(async()=>{await composer.locator('[data-slot="aui-composer-character-count"]').getByText(String(draftText.length),{exact:true}).waitFor();});
 await composer.screenshot({path:path.join(output,"14-final-composer-with-new-feature.png")});
 await checks();
 assert.deepEqual(errors,[],"Browser errors must be investigated");
 await savedJson("verification.json",{realCreator:true,realModel:true,automaticRuntimeVerdicts:runtimeVerdicts,modelRequestCount:runs.length,localNpmArchives:archives,applicationBeforeHash:digest(appAfterTakeover),applicationAfterHash:digest(await readFile(appPath)),definitionUnchanged:true,modelUnchanged:true,initialStyle:style,finalStyle,adoptedGeometry,finalGeometry,newCharacterCounter:true,characterCounterProbe:{input:draftText,expectedText:String(draftText.length),assertionPassed:true},ownership:JSON.parse(await readFile(ownershipPath,"utf8")),browserErrors:errors});
 await cp(composerRoot,path.join(output,"final-composer"),{recursive:true});
 console.log("LIVE_FLOW_COMPLETE",output);
}catch(error){await page?.screenshot({path:path.join(output,"99-failed-state.png"),fullPage:true}).catch(()=>{});await savedJson("failure.json",{error:String(error),errors,hostRoot:host.hostRoot});await cp(composerRoot,path.join(output,"failed-composer"),{recursive:true}).catch(()=>{});console.log("LIVE_REVIEW_REQUIRED",String(error),browserServer?.wsEndpoint());await new Promise(()=>{});throw error;}
finally{await cp(path.join(host.hostRoot,".agentuicreator/logs"),path.join(output,"creator-logs"),{recursive:true}).catch(()=>{});await browser?.close();await browserServer?.close();await host.close();}
