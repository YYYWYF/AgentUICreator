/** Real Creator source sync and real-model conflict merge acceptance on isolated npm consumer projects. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile,rm,cp,mkdtemp} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {planPluginSourceTakeover,takeoverPluginSource} from "../packages/operator/src/project/takeover-plugin-source.js";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {spawn} from "node:child_process";
import {createLocalReleaseRegistry} from "./support/local-release-registry.mjs";
import {resourcePackageInvocation} from "../packages/operator/src/project/ensure-resource-packages.js";
import {runUpdateCommand} from "../packages/operator/src/updates/npm-artifact.js";
import {createConnectionHostFixture} from "../apps/creator-workbench/tests/support/agent-connection-host.js";
const repo=fileURLToPath(new URL("..",import.meta.url));
const output=process.argv[3] ? path.resolve(process.argv[3]) : path.join(repo,"docs/verification/source-sync-real-model-2026-10-18");await mkdir(output,{recursive:true});
const releases=JSON.parse(await readFile(process.argv[2]!,"utf8"));
const archives=releases.files.map((name:string)=>path.join(releases.archives,name));
const officialArchives=JSON.parse(await readFile(process.argv[4]!,"utf8"));
const registry=await createLocalReleaseRegistry(repo,[...officialArchives,...archives]);
process.env.CREATOR_UPDATE_MANIFEST_URL=registry.url+"/compatibility.json";
const installed=path.join(releases.root,"0.0.1/packages/plugins");
let initialManifest:string,initialLock:string;
let host=await createConnectionHostFixture({liveModel:true,pluginsPackageRoot:installed,prepareHost:async root=>{
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


const takeover=await planPluginSourceTakeover(host.hostRoot,{pluginId:"composer"});
await takeoverPluginSource(host.hostRoot,{pluginId:"composer",planHash:takeover.planHash});
await runUpdateCommand(host.hostRoot,"npm",["install","--ignore-scripts","--fetch-retries=0","@za38.03/agent-ui-plugins@0.0.2","@za38.03/agent-ui-runtime@0.0.2"]);
const persistent=await mkdtemp(path.join(tmpdir(),"source-sync-ui-"));const target=path.join(persistent,"host");
await cp(host.hostRoot,target,{recursive:true,dereference:true});await host.close();


const require=createRequire(path.join(repo,"apps/creator-workbench/package.json"));const {chromium}=require("@playwright/test");
const digest=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
const browser=await chromium.launch({headless:true,...(process.platform==="darwin"?{executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}:{})});
const outcomes:any[]=[];
async function runCase(kind:"sync"|"conflict") {
 const root=path.join(persistent,kind);await cp(target,root,{recursive:true,dereference:true});
 const dir=path.join(output,kind);await mkdir(dir,{recursive:true});
 const composerRoot=path.join(root,"src/agent-ui/plugins/composer");
 const app=path.join(composerRoot,"index.tsx"),definition=path.join(composerRoot,"definition.ts"),source=path.join(composerRoot,"source/adapters/composer.tsx"),textarea=path.join(composerRoot,"source/adapters/textarea.tsx");
 const model=path.join(root,"src/agent-ui/app-ui/app-ui.json"),owner=path.join(root,".agent-ui/plugin-ownership.json");
 await writeFile(app,`import { ConversationComposerPlugin as Composer } from "./source/index";
import type { ComponentProps } from "react";
export function ConversationComposerPlugin(props: ComponentProps<typeof Composer>) {
 const { rootProps, ...rest } = props;
 return <Composer {...rest} rootProps={{...rootProps,style:{...rootProps?.style,padding:12,borderRadius:20,backgroundColor:"#f3e8ff"}}}/>;
}
`);
 if(kind==="conflict") {
  let code=await readFile(source,"utf8");const start=code.indexOf('          <div data-slot="aui_composer-actions"');const end=code.indexOf('          </div>\n        </div>',start)+"          </div>\n".length;
  assert(start>0&&end>start);const toolbar=code.slice(start,end);code=code.slice(0,start)+code.slice(end);const insertion=code.indexOf("          <ComposerInputHostContext.Provider");assert(insertion>0);code=code.slice(0,insertion)+toolbar+code.slice(insertion);await writeFile(source,code);
 } else await writeFile(textarea,(await readFile(textarea,"utf8"))+"\n// Existing source customization: keep this project note.\n");
 const protectedFiles=[app,definition,model,path.join(root,"package.json"),path.join(root,"package-lock.json")];
 const before=await Promise.all(protectedFiles.map(file=>readFile(file)));const ownerBefore=await readFile(owner,"utf8");const textareaBefore=await readFile(textarea,"utf8");
 const activeHost=await createConnectionHostFixture({liveModel:true,existingHostRoot:root});
 const page=await browser.newPage({viewport:{width:1640,height:1200},reducedMotion:"reduce"});page.setDefaultTimeout(60000);
 const errors:string[]=[],responses:any[]=[],runs:any[]=[];
 const save=async(name:string,value:any)=>writeFile(path.join(dir,name),JSON.stringify(value,null,2));
 const shot=async(name:string)=>{await page.screenshot({path:path.join(dir,name),fullPage:true});await writeFile(path.join(dir,name.replace(/\.png$/,".txt")),await page.locator("body").innerText());};
 page.on("pageerror",(error:Error)=>errors.push(error.message));page.on("response",async(response:any)=>{const route=new URL(response.url()).pathname;if(route.startsWith("/__creator/updates/"))try{responses.push({route,status:response.status(),body:await response.json()});await save("update-responses.json",responses);}catch{}if(route==="/__creator/run")try{runs.push({request:JSON.parse(response.request().postData()||"{}"),response:await response.text()});await save("model-runs.json",runs);console.log("MODEL_RUN_FINISHED",kind,runs.length);}catch{}});
 const preview=page.frameLocator('iframe[title="Host Application"]');const composer=preview.locator('[data-plugin-instance-id="composer-main"]');
 const geometry=async()=>({actions:await composer.locator('[data-slot="aui_composer-actions"]').boundingBox(),input:await composer.locator('[data-slot="aui_composer-input"]').boundingBox()});
 const style=()=>composer.locator("form").evaluate((el:HTMLElement)=>({padding:getComputedStyle(el).padding,radius:getComputedStyle(el).borderRadius,background:getComputedStyle(el).backgroundColor}));
 const openUpdates=async()=>{await page.getByRole("button",{name:"设置",exact:true}).click();await page.getByRole("button",{name:"插件更新",exact:true}).click();};
 try {
  await page.goto(activeHost.creatorOrigin);await page.locator("#creator-request").waitFor({timeout:120000});await composer.locator('[data-slot="aui_composer-input"]').waitFor({timeout:30000}).catch(async()=>{await page.reload();await composer.locator('[data-slot="aui_composer-input"]').waitFor({timeout:120000});});
  const separator=page.getByRole("separator");if(await separator.count()){await separator.focus();for(let i=0;i<12;i++)await separator.press("ArrowLeft");}
  assert.deepEqual(await style(),{padding:"12px",radius:"20px",background:"rgb(243, 232, 255)"});const geometryBefore=await geometry();if(kind==="conflict")assert(geometryBefore.actions!.y+geometryBefore.actions!.height<=geometryBefore.input!.y);
  await shot("01-before-sync.png");await openUpdates();await page.getByRole("button",{name:"查看同步方案",exact:true}).click();
  await page.getByRole("heading",{name:kind==="conflict"?"需要合并已有修改":"确认本次更新",exact:true}).waitFor();await shot("02-confirm-plan.png");await page.locator(".creator-update-plugin-card").screenshot({path:path.join(dir,"02-confirm-card.png")});
  const plan=responses.findLast(r=>r.route.endsWith("/plan"))?.body;assert.equal(plan.requiresMerge,kind==="conflict");assert.equal(await readFile(owner,"utf8"),ownerBefore);assert(!responses.some(r=>r.route.endsWith("/execute")||r.route.endsWith("/adopt")));
  let runtimeVerdict:any;
  if(kind==="sync"){
   await page.getByRole("button",{name:"确认更新",exact:true}).click();
  } else {
   await page.getByRole("button",{name:"让 Creator 合并",exact:true}).click();await shot("03-real-model-merging.png");
   const waitRun=async(previous:number)=>{const deadline=performance.now()+12*60*1000;let last=performance.now();const started=performance.now();while(performance.now()<deadline){if(performance.now()-started>4*60*1000 && !(await page.locator(".creator-tool-activity").count()) && runs.length===previous)throw Error("Model execution produced no tool progress for four minutes");if(await page.locator('.creator-question-card[data-status="pending"]').count())throw Error("Unexpected model confirmation question");if(runs.length>previous&&await page.locator("#creator-request").count()&&!await page.locator("#creator-request").isDisabled())return;if(performance.now()-last>=30000){await shot("03-real-model-working.png");console.log("MODEL_PROGRESS",kind,(await page.locator("body").innerText()).slice(-350));last=performance.now();}await page.waitForTimeout(1000);}throw Error("Real model merge timed out");};
   for(let attempt=0;attempt<3;attempt++){
    const previous=attempt===0?0:runs.length;await waitRun(previous);
    if(!['"code":"ACTION_SELECTION_FAILED"','"code":"MODEL_TOOL_PROTOCOL_ERROR"'].some(code=>runs.at(-1).response.includes(code)))break;
    if(attempt===2)throw Error("Real model protocol retries exhausted");
    const retry=page.getByRole("button",{name:"放弃本次任务",exact:true});if(await retry.isVisible())await retry.click();
    await page.locator("#creator-request").fill("继续更新页刚才授权的 composer 源码合并：只修改 source/ 实现。保留操作工具栏在输入框上方的真实 JSX 顺序，合入新版的输入字数统计。应用层浅紫色背景、12px 内边距、20px 圆角必须保持。不要编辑应用层、AppUIModel、ownership 或基线。使用真实验证工具验证预览，完成后让我在更新页确认同步。");await page.getByRole("button",{name:"发送",exact:true}).click();
   }
   const events=runs.at(-1).response.split("\n").filter((line:string)=>line.startsWith("data: ")).map((line:string)=>JSON.parse(line.slice(6)));const final=events.findLast((event:any)=>event.type==="RUN_FINISHED");runtimeVerdict=final?.result?.receipt?.verification;await save("runtime-verdict.json",runtimeVerdict??null);
   assert.equal(runtimeVerdict?.status,"changed-and-verified");assert.equal(runtimeVerdict.checks.find((check:any)=>check.id==="runtime-verification")?.status,"passed");
   await shot("04-model-finished-awaiting-user.png");assert.equal(await readFile(owner,"utf8"),ownerBefore,"Model must not adopt the baseline");
   await openUpdates();await page.getByRole("button",{name:"验证并完成同步",exact:true}).waitFor();await shot("05-user-review.png");await page.locator(".creator-update-plugin-card").screenshot({path:path.join(dir,"05-review-card.png")});
   const reviewedGeometry=await geometry();assert(reviewedGeometry.actions!.y+reviewedGeometry.actions!.height<=reviewedGeometry.input!.y,"Review rejected: existing toolbar customization was lost");
   assert(!responses.some(r=>r.route.endsWith("/adopt")));await page.waitForFunction(()=>[...document.querySelectorAll("button")].some(button=>button.textContent==="验证并完成同步"&&!button.disabled));await page.locator(".creator-update-plugin-card").screenshot({path:path.join(dir,"05-review-card.png")});await page.getByRole("button",{name:"验证并完成同步",exact:true}).click();
  }
  await page.getByText("源码已同步，检查通过。",{exact:true}).first().waitFor({timeout:180000});await shot("06-sync-complete.png");
  for(let i=0;i<protectedFiles.length;i++)assert((await readFile(protectedFiles[i]!)).equals(before[i]!),`Protected file changed: ${protectedFiles[i]}`);
  assert.equal(await readFile(textarea,"utf8"),textareaBefore,"Existing source edits in other files must survive");
  const ownerAfter=JSON.parse(await readFile(owner,"utf8"));assert.equal(ownerAfter.plugins.composer.pluginVersion,"0.0.2");
  const geometryAfter=await geometry();if(kind==="conflict")assert(geometryAfter.actions!.y+geometryAfter.actions!.height<=geometryAfter.input!.y);
  assert.deepEqual(await style(),{padding:"12px",radius:"20px",background:"rgb(243, 232, 255)"});
  const text="保留应用层，合并新功能";await composer.getByRole("textbox").fill(text);await composer.locator('[data-slot="aui-composer-character-count"]').getByText(String(text.length),{exact:true}).waitFor();await composer.screenshot({path:path.join(dir,"07-final-composer.png")});
  for(const name of ["verify:ui","typecheck","build"]){await writeFile(path.join(dir,`host-${name.replace(":","-")}.log`),await runUpdateCommand(root,"npm",["run",name]));}
  assert.deepEqual(errors,[]);await cp(composerRoot,path.join(dir,"final-composer"),{recursive:true});
  const result={kind,realCreator:true,realModel:kind==="conflict",modelRequests:runs.length,runtimeVerdict,requiresMerge:plan.requiresMerge,protectedFiles:protectedFiles.map((file,i)=>({path:path.relative(root,file).split(path.sep).join("/"),before:digest(before[i]!),after:digest(before[i]!)})),applicationPreserved:true,existingSourceCustomizationPreserved:true,newCounter:{input:text,expected:text.length,passed:true},style:await style(),geometryBefore,geometryAfter,adoptedVersion:ownerAfter.plugins.composer.pluginVersion,browserErrors:errors};await save("verification.json",result);outcomes.push(result);console.log("CASE_PASSED",kind);
 }catch(error){await shot("99-failed-state.png").catch(()=>{});await save("failure.json",{error:String(error),errors,root});await cp(composerRoot,path.join(dir,"failed-composer"),{recursive:true});throw error;}
 finally{await cp(path.join(root,".agentuicreator/logs"),path.join(dir,"creator-logs"),{recursive:true}).catch(()=>{});await page.close();await activeHost.close();}
}
try{if(!process.argv.includes("--conflict-only"))await runCase("sync");await runCase("conflict");await writeFile(path.join(output,"verification.json"),JSON.stringify({allPassed:true,outcomes,localCandidateRegistry:true,externalPublishedRelease:false},null,2));console.log("REAL_SOURCE_SYNC_AND_MERGE_PASS");}
finally{await browser.close();await registry.close();await rm(persistent,{recursive:true,force:true});}
