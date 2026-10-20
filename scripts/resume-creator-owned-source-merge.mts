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
const output=process.argv[3] ? path.resolve(process.argv[3]) : path.join(repo,"docs/verification/creator-real-npm-update-2026-10-18");await mkdir(output,{recursive:true});
const previousSession=JSON.parse(await readFile(path.join(output,"live-session.json"),"utf8"));
const npmrc=await readFile(path.join(previousSession.hostRoot,".npmrc"),"utf8");process.env.CREATOR_UPDATE_MANIFEST_URL=npmrc.match(/^registry=(.+)$/m)![1]+"/compatibility.json";
const clear=await fetch(new URL("/__agent-ui/creator/workspace/clear",previousSession.creatorOrigin),{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});assert.equal(clear.status,200);
const host=await createConnectionHostFixture({liveModel:true,existingHostRoot:previousSession.hostRoot});
const require=createRequire(path.join(repo,"apps/creator-workbench/package.json"));const {chromium}=require("@playwright/test");
const runs:any[]=[],errors:string[]=[],upgradeResponses:any[]=JSON.parse(await readFile(path.join(output,"update-responses.json"),"utf8"));
const composerRoot=path.join(host.hostRoot,"src/agent-ui/plugins/composer");
const appPath=path.join(composerRoot,"index.tsx"),definitionPath=path.join(composerRoot,"definition.ts"),ownershipPath=path.join(host.hostRoot,".agent-ui/plugin-ownership.json");
const modelPath=path.join(host.hostRoot,"src/agent-ui/app-ui/app-ui.json");const modelBefore=await readFile(modelPath);
const appAfterTakeover=await readFile(appPath),defAfterTakeover=await readFile(definitionPath),ownershipBeforeSync=await readFile(ownershipPath);
const style=JSON.parse(await readFile(path.join(output,"props-proof.json"),"utf8")).style;
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
 await savedJson("source-merge-runtime-verdicts.json",runtimeVerdicts);
 assert.equal(verdict?.status,"changed-and-verified",`${label}: automatic completion must be verified`);
 assert.equal(verdict.checks.find((check:any)=>check.id==="runtime-verification")?.status,"passed");
}
async function checks(){for(const name of ["verify:ui","typecheck","build"]){const log=await runUpdateCommand(host.hostRoot,"npm",["run",name]);await writeFile(path.join(output,`final-${name.replace(":","-")}.log`),log);}}

try{
 console.log("LIVE_CREATOR",JSON.stringify({creatorOrigin:host.creatorOrigin,hostOrigin:host.hostOrigin,root:host.hostRoot}));
 browserServer=await chromium.launchServer({headless:true,...(process.platform==="darwin"?{executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}:{})});
 await savedJson("resumed-live-session.json",{webSocket:browserServer.wsEndpoint(),hostRoot:host.hostRoot,creatorOrigin:host.creatorOrigin,hostOrigin:host.hostOrigin});
 browser=await chromium.connect(browserServer.wsEndpoint());
 page=await browser.newPage({viewport:{width:1840,height:1500},deviceScaleFactor:1});page.setDefaultTimeout(60000);
 page.on("pageerror",(error:Error)=>{errors.push(error.message);console.log("PAGE_ERROR",error.message)});
 page.on("response",async(response:any)=>{const pathname=new URL(response.url()).pathname;
  if(pathname==="/__creator/run")try{runs.push({request:JSON.parse(response.request().postData()||"{}"),response:await response.text()});await savedJson("creator-source-merge-runs.json",runs);console.log("MODEL_RUN_FINISHED",runs.length);}catch{}
  if(pathname.startsWith("/__creator/updates/"))try{upgradeResponses.push({route:pathname,status:response.status(),body:await response.json()});await savedJson("update-responses.json",upgradeResponses);}catch{}
 });
 await page.goto(host.creatorOrigin);await page.locator("#creator-request").waitFor({state:"visible",timeout:180000});
 const separator=page.getByRole("separator");if(await separator.count()){await separator.focus();for(let i=0;i<18;i++)await separator.press("ArrowLeft");}
 const preview=page.frameLocator('iframe[title="Host Application"]');
 const composer=preview.locator('[data-plugin-instance-id="composer-main"]');await composer.locator('[data-slot="aui_composer-input"]').waitFor({timeout:30000}).catch(async()=>{await page.reload();await composer.locator('[data-slot="aui_composer-input"]').waitFor({timeout:120000});});
 await page.getByRole("button",{name:"设置",exact:true}).click();await page.getByRole("button",{name:"插件更新",exact:true}).click();await page.getByRole("button",{name:"同步实现源码",exact:true}).waitFor({timeout:120000});
 assert((await readFile(appPath)).equals(appAfterTakeover));await shot("12-npm-installed-source-sync-available.png");
 const priorPlan=upgradeResponses.findLast((r:any)=>r.route.endsWith("/packages/plan"))?.body;
 await savedJson("npm-upgrade-proof.json",{realNpmInstall:true,result:upgradeResponses.findLast((r:any)=>r.route.endsWith("/packages/execute"))?.body,plan:priorPlan,sameProjectReopenedAfterToolRestart:true,applicationHash:digest(appAfterTakeover),ownershipAndBASEUnchanged:JSON.stringify(JSON.parse(ownershipBeforeSync.toString()))===JSON.stringify(JSON.parse(await readFile(path.join(output,"takeover-proof.json"),"utf8")).ownership)});
 const geometry=async()=>({actions:await composer.locator('[data-slot="aui_composer-actions"]').boundingBox(),input:await composer.locator('[data-slot="aui_composer-input"]').boundingBox()});const adoptedGeometry=await geometry();
 await page.getByRole("button",{name:"同步实现源码",exact:true}).click();await page.getByRole("button",{name:"使用模型合并",exact:true}).waitFor();await shot("13-source-sync-conflict-plan.png");
 const conflictPlan=upgradeResponses.findLast((response:any)=>response.route.endsWith("/plan"))?.body;
 assert.equal(conflictPlan?.requiresMerge,true,"Update plan must require real merge");
 await savedJson("conflict-proof.json",conflictPlan);
 const beforeMergeRuns=runs.length;await page.getByRole("button",{name:"使用模型合并",exact:true}).click();await retrySelector("11-model-merge",beforeMergeRuns);await assertRuntimePassed("source-merge");
 assert((await readFile(appPath)).equals(appAfterTakeover));await shot("14-real-model-merge-complete.png");
 // Model completes editing; the user adopts the validated baseline from Updates.
 await page.getByRole("button",{name:"设置",exact:true}).click();await page.getByRole("button",{name:"插件更新",exact:true}).click();
 await page.getByRole("button",{name:"我已完成合并：验证并推进基线",exact:true}).waitFor({state:"visible",timeout:120000});await shot("15-merged-awaiting-validation.png");
 await page.getByRole("button",{name:"我已完成合并：验证并推进基线",exact:true}).click();
 await page.getByText("插件更新完成，验证通过。",{exact:true}).first().waitFor({state:"visible",timeout:180000});await shot("16-source-sync-complete.png");
 assert((await readFile(appPath)).equals(appAfterTakeover));assert((await readFile(definitionPath)).equals(defAfterTakeover));assert((await readFile(modelPath)).equals(modelBefore));
 await composer.locator('[data-slot="aui-composer-character-count"]').waitFor({state:"visible",timeout:120000});
 const finalGeometry=await geometry();assert(finalGeometry.actions!.y+finalGeometry.actions!.height<=finalGeometry.input!.y);
 const finalStyle=await composer.locator("form").evaluate((el:HTMLElement)=>({padding:getComputedStyle(el).padding,background:getComputedStyle(el).backgroundColor,radius:getComputedStyle(el).borderRadius}));assert.deepEqual(finalStyle,style);
 const draftText="保留应用层，合并新功能";
 await composer.getByRole("textbox").fill(draftText);
 await assert.doesNotReject(async()=>{await composer.locator('[data-slot="aui-composer-character-count"]').getByText(String(draftText.length),{exact:true}).waitFor();});
 await composer.screenshot({path:path.join(output,"17-final-composer-with-new-feature.png")});
 await checks();
 assert.deepEqual(errors,[],"Browser errors must be investigated");
 await savedJson("verification.json",{realCreator:true,realModel:true,automaticRuntimeVerdicts:runtimeVerdicts,modelRequestCount:runs.length,realNpmInstall:true,continuedFromSameProject:true,applicationBeforeHash:digest(appAfterTakeover),applicationAfterHash:digest(await readFile(appPath)),definitionUnchanged:true,modelUnchanged:true,initialStyle:style,finalStyle,adoptedGeometry,finalGeometry,newCharacterCounter:true,characterCounterProbe:{input:draftText,expectedText:String(draftText.length),assertionPassed:true},ownership:JSON.parse(await readFile(ownershipPath,"utf8")),browserErrors:errors});
 await cp(composerRoot,path.join(output,"final-composer"),{recursive:true});
 console.log("LIVE_FLOW_COMPLETE",output);
}catch(error){await page?.screenshot({path:path.join(output,"99-failed-state.png"),fullPage:true}).catch(()=>{});await savedJson("source-merge-failure.json",{error:String(error),errors,hostRoot:host.hostRoot});await cp(composerRoot,path.join(output,"failed-composer"),{recursive:true}).catch(()=>{});console.log("LIVE_REVIEW_REQUIRED",String(error),browserServer?.wsEndpoint());await new Promise(()=>{});throw error;}
finally{await cp(path.join(host.hostRoot,".agent-ui/creator/logs"),path.join(output,"creator-logs"),{recursive:true}).catch(()=>{});await browser?.close();await browserServer?.close();await host.close();}
