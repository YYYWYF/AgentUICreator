/** Full Creator workbench + local sidecar + configured real model. No API
 * interception, fake graph, replacement tool, or precomputed question. */
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile, cp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnPnpm } from "./pnpm-process.mjs";
import { createConnectionHostFixture } from "../apps/creator-workbench/tests/support/agent-connection-host.js";
const repo=fileURLToPath(new URL("..",import.meta.url));
const require=createRequire(path.join(repo,"apps/creator-workbench/package.json"));
const {chromium}=require("@playwright/test");
const output=path.join(repo,"docs/verification/creator-live-source-takeover-runtime-fix");
async function verifyRecordedFlow() {
 const captured=JSON.parse(await readFile(path.join(output,"creator-runs.json"),"utf8"));
 const events=captured.flatMap((run:{response:string})=>run.response.split("\n").filter(line=>line.startsWith("data: ")).map(line=>JSON.parse(line.slice(6))));
 const finished=events.findLast((event:any)=>event.type==="RUN_FINISHED"&&event.result?.receipt);
 // Domain runs publish verification in the authoritative receipt. The optional
 // top-level runtimeVerificationStatus telemetry field is not emitted here.
 assert.equal(finished?.outcome?.type,"success");
 assert.equal(finished?.result?.receipt?.verification?.status,"changed-and-verified");
 assert(finished.result.receipt.verification.checks.some((check:any)=>check.id==="runtime-verification"&&check.status==="passed"));
 const positions=JSON.parse(await readFile(path.join(output,"preview-proof.json"),"utf8"));
 assert.equal(positions.manualRefresh,false);
 assert(positions.beforeGeometry.actions.y>positions.beforeGeometry.input.y);
 assert(positions.afterGeometry.actions.y+positions.afterGeometry.actions.height<=positions.afterGeometry.input.y);
 const source=JSON.parse(await readFile(path.join(output,"final-proof.json"),"utf8"));
 assert(source.modelUnchanged&&source.registry.includes('./composer/definition'));
 return finished.result.receipt.verification;
}
if(process.argv.includes("--verify-recorded")) {
 console.log("RECORDED_REAL_FLOW_VERIFIED",JSON.stringify(await verifyRecordedFlow()));
 process.exit(0);
}
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
const host=await createConnectionHostFixture({liveModel:true});
console.log("LIVE_CREATOR",JSON.stringify({creatorOrigin:host.creatorOrigin,hostOrigin:host.hostOrigin,projectRoot:host.hostRoot}));
const modelPath=path.join(host.hostRoot,"src/agent-ui/app-ui/app-ui.json");
const modelBefore=await readFile(modelPath);
const ownershipPath=path.join(host.hostRoot,".agent-ui/plugin-ownership.json");
let browser:any,page:any;
const browserErrors:string[]=[], runs:Array<Record<string,unknown>>=[];
const previewNavigations:string[]=[];
async function exists(file:string){return readFile(file).then(()=>true,()=>false)}
async function proof(){const owner=await readFile(ownershipPath).catch(()=>null);const registry=await readFile(path.join(host.hostRoot,"src/agent-ui/plugins/registry.generated.ts"),"utf8");return {modelUnchanged:(await readFile(modelPath)).equals(modelBefore),ownership:owner?JSON.parse(owner.toString()):null,registry:registry.split("\n").filter(line=>line.includes('@za38.03/agent-ui-plugins/composer"')||line.includes('./composer/definition"')).join("\n")}}
try {
 for(const check of ["verify:ui","typecheck","build"]){
  const result=await new Promise<{code:number|null;output:string}>((resolve,reject)=>{let output="";const child=spawnPnpm(["run",check],{cwd:host.hostRoot,stdio:["ignore","pipe","pipe"]});child.stdout.on("data",chunk=>output+=chunk);child.stderr.on("data",chunk=>output+=chunk);child.on("error",reject);child.on("close",code=>resolve({code,output}));});
  await writeFile(path.join(output,`baseline-${check.replace(":","-")}.log`),result.output);assert.equal(result.code,0,`Host baseline ${check} failed: ${result.output}`);
 }
 const chrome=process.env.AGENT_UI_TEST_CHROME_PATH??(process.platform==="darwin"?"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome":undefined);
 browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{})});
 page=await browser.newPage({viewport:{width:1840,height:1500},deviceScaleFactor:1});page.setDefaultTimeout(60000);
 page.on("framenavigated",(frame:any)=>{if(frame.url().startsWith(host.hostOrigin))previewNavigations.push(frame.url());});
 page.on("pageerror",(error:Error)=>{browserErrors.push(error.message);console.log("BROWSER_ERROR",error.message)});
 page.on("response",async(response:any)=>{if(new URL(response.url()).pathname==="/__creator/run") {try{const body=await response.text();const request=JSON.parse(response.request().postData()||"{}");runs.push({status:response.status(),request,response:body});await writeFile(path.join(output,"creator-runs.json"),JSON.stringify(runs,null,2));console.log("CREATOR_RUN",JSON.stringify({status:response.status(),bytes:body.length,tail:body.slice(-450)}));}catch(error){console.log("RUN_CAPTURE",String(error))}}});
 await page.goto(host.creatorOrigin);
 const input=page.locator("#creator-request");await input.waitFor({state:"visible",timeout:180000});
 await page.getByRole("button",{name:"发送",exact:true}).waitFor({state:"visible",timeout:180000});
 const separator=page.getByRole("separator");if(await separator.count()){await separator.focus();for(let i=0;i<18;i++)await separator.press("ArrowLeft");}
 const preview=page.frameLocator('iframe[title="Host Application"]');
 await preview.locator('[data-plugin-instance-id="composer-main"] [data-slot="aui_composer-input"]').waitFor({state:"visible",timeout:180000});
 const geometry=async()=>({actions:await preview.locator('[data-plugin-instance-id="composer-main"] [data-slot="aui_composer-actions"]').boundingBox(),input:await preview.locator('[data-plugin-instance-id="composer-main"] [data-slot="aui_composer-input"]').boundingBox()});
 const beforeGeometry=await geometry();assert(beforeGeometry.actions!.y>beforeGeometry.input!.y,"Baseline toolbar must be below input");
 await page.screenshot({path:path.join(output,"01-full-creator-ready.png"),fullPage:true});
 const prompt="请实际修改主 Composer 的内部布局：把操作工具栏（leadingActions、trailingActions、submitAction）移到文本输入框上方，附件和队列位置保持不变。这是一项要落地并验证的 UI 修改任务。保留 composer 插件 ID、composer-main 实例 ID、配置和 Slot 组合，保持发送、附件和 Lexical 输入功能。当前 Composer 默认来自 npm 包；若内部结构修改需要接管源码，请先在 Creator 中询问我是否同意转为工程源码托管，展示当前安装版本的计划，收到确认后再提取源码并优先修改 adapters。";
 await page.waitForFunction(() => !(document.querySelector("#creator-request") as HTMLTextAreaElement)?.disabled);
 await input.fill(prompt);await page.screenshot({path:path.join(output,"02-request-entered.png"),fullPage:true});
 const send=page.getByRole("button",{name:"发送",exact:true});await send.waitFor();await send.click();
 await writeFile(path.join(output,"request.txt"),prompt);
 console.log("REQUEST_SENT");
 let question:any=null;
 const deadline=Date.now()+12*60*1000;
 let lastShot=0;
 while(Date.now()<deadline){
  question=page.locator('.creator-question-card[data-status="pending"]');
  if(await question.count())break;
  if(Date.now()-lastShot>30000){await page.screenshot({path:path.join(output,"03-model-working.png"),fullPage:true});await writeFile(path.join(output,"progress.txt"),await page.locator("body").innerText());console.log("MODEL_WORKING",(await page.locator('.creator-panel-messages').innerText().catch(()=>"")).slice(-700));lastShot=Date.now()}
  const completed=!(await input.isDisabled());
  if(completed && Date.now()>deadline-11.5*60*1000){throw Error("Real model run ended before a source takeover confirmation. See progress and run trace.")}
  await page.waitForTimeout(1500);
 }
 assert(question && await question.count(),"Real model never produced a confirmation");
 const questionText=await question.innerText();await writeFile(path.join(output,"question.txt"),questionText);
 assert(/源码|托管|source|ownership/i.test(questionText),"Question does not concern source ownership");
 assert(!questionText.includes("planHash")&&!questionText.includes("plugins/composer")&&!questionText.includes("catalogHash"),"Confirmation must not expose internal plan details");
 assert.equal(await exists(ownershipPath),false,"No ownership may be recorded before consent");
 await question.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,"04-real-model-confirmation.png"),fullPage:true});
 console.log("REAL_QUESTION",questionText.slice(0,550));
 const approve=question.getByRole("radio",{name:/同意.*源码|同意.*托管|Manage source/i});
 assert(await approve.count(),"Real question has no explicit source ownership approval choice");
 await approve.first().check();await question.getByRole("button",{name:"确认选择",exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(output,"05-approve-source-ownership.png"),fullPage:true});
 await question.getByRole("button",{name:"确认选择",exact:true}).click();console.log("APPROVAL_SUBMITTED");
 const finish=Date.now()+15*60*1000;let adopted=false,settled=false;
 while(Date.now()<finish){
  if(!adopted && await exists(ownershipPath)) {adopted=true;console.log("SOURCE_ADOPTED");await page.screenshot({path:path.join(output,"06-source-takeover-complete.png"),fullPage:true});await writeFile(path.join(output,"adoption-proof.json"),JSON.stringify(await proof(),null,2));}
  if(adopted && !(await input.isDisabled())){settled=true;break;}
  if(Date.now()-lastShot>30000){await page.screenshot({path:path.join(output,"07-model-adapting-source.png"),fullPage:true});await writeFile(path.join(output,"progress.txt"),await page.locator("body").innerText());console.log("MODEL_AFTER_APPROVAL",(await page.locator('.creator-panel-messages').innerText().catch(()=>"")).slice(-700));lastShot=Date.now()}
  if(await page.locator('.creator-question-card[data-status="pending"]').count())throw Error("A second material question requires review; progress retained.");
  await page.waitForTimeout(1500);
 }
 assert(adopted,"Source takeover did not actually complete");
 assert(settled,"Source adopted, but the real model continuation did not finish before the deadline");
 const final=await proof();assert(final.modelUnchanged,"AppUIModel changed unexpectedly");assert(final.registry.includes('./composer/definition'),"Local Composer registry was not selected");
 const afterGeometry=await geometry();
 await writeFile(path.join(output,"preview-proof.json"),JSON.stringify({beforeGeometry,afterGeometry,previewNavigations,manualRefresh:false},null,2));
 assert(afterGeometry.actions!.y+afterGeometry.actions!.height<=afterGeometry.input!.y,"Local source modification did not become visible above the input");
 await page.screenshot({path:path.join(output,"08-full-creator-final.png"),fullPage:true});
 await preview.locator('[data-plugin-instance-id="composer-main"]').screenshot({path:path.join(output,"09-local-composer-visible.png")});
 await writeFile(path.join(output,"final-ui.txt"),await page.locator("body").innerText());
 await writeFile(path.join(output,"final-proof.json"),JSON.stringify({...final,creatorOrigin:host.creatorOrigin,hostOrigin:host.hostOrigin,projectRoot:host.hostRoot,browserErrors,underlyingTestAgentRuns:host.runCount(),realModel:true,requestCount:runs.length},null,2));
 await cp(path.join(host.hostRoot,"src/agent-ui/plugins/composer"),path.join(output,"adopted-composer"),{recursive:true});
 if(await readdir(path.join(host.hostRoot,".agent-ui/creator")).catch(()=>null))await cp(path.join(host.hostRoot,".agent-ui/creator"),path.join(output,"creator-evidence"),{recursive:true,filter:source=>!path.relative(path.join(host.hostRoot,".agent-ui/creator"),source).split(path.sep).some(part=>part==="control"||part==="cache")});
 await verifyRecordedFlow();
 console.log("LIVE_FLOW_COMPLETE",output);
} catch(error){
 await page?.screenshot({path:path.join(output,"99-failed-state.png"),fullPage:true}).catch(()=>undefined);
 await cp(path.join(host.hostRoot,".agent-ui/creator/logs"),path.join(output,"creator-evidence/logs"),{recursive:true}).catch(()=>undefined);
 await cp(path.join(host.hostRoot,"src/agent-ui/plugins/composer"),path.join(output,"adopted-composer"),{recursive:true}).catch(()=>undefined);
 console.error("LIVE_FLOW_FAILED",String(error));throw error;
}
finally{await browser?.close();await host.close()}
