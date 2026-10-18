/** Real Creator visual acceptance with an actual local npm feed and artifact plan; no model calls or upgrades. */
import assert from "node:assert/strict";
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
const output=process.argv[3] ? path.resolve(process.argv[3]) : path.join(repo,"docs/verification/source-sync-simple-2026-10-18");await mkdir(output,{recursive:true});
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
host=await createConnectionHostFixture({liveModel:true,existingHostRoot:target});
const require=createRequire(path.join(repo,"apps/creator-workbench/package.json"));const {chromium}=require("@playwright/test");
let browser:any,page:any;const errors:string[]=[];const responses:any[]=[];
const source=path.join(target,"src/agent-ui/plugins/composer/source/adapters/composer.tsx");
const application=path.join(target,"src/agent-ui/plugins/composer/index.tsx");const applicationBefore=await readFile(application,"utf8");
const ownerPath=path.join(target,".agent-ui/plugin-ownership.json");const ownerBefore=await readFile(ownerPath,"utf8");
try {
 browser=await chromium.launch({headless:true,...(process.platform==="darwin"?{executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}:{})});
 page=await browser.newPage({viewport:{width:1440,height:1150},reducedMotion:"reduce"});page.setDefaultTimeout(45000);
 page.on("pageerror",(error:Error)=>errors.push(error.message));page.on("response",async(response:any)=>{if(new URL(response.url()).pathname.startsWith("/__creator/updates/"))try{responses.push({route:new URL(response.url()).pathname,status:response.status(),body:await response.json()});}catch{}});
 await page.goto(host.creatorOrigin);await page.locator("#creator-request").waitFor({timeout:120000});
 const input=page.frameLocator('iframe[title="Host Application"]').locator('[data-slot="aui_composer-input"]');await input.waitFor({timeout:30000}).catch(async()=>{await page.reload();await input.waitFor({timeout:120000});});
 const separator=page.getByRole("separator");if(await separator.count()){await separator.focus();for(let i=0;i<4;i++)await separator.press("ArrowLeft");}
 await page.getByRole("button",{name:"设置",exact:true}).click();await page.getByRole("button",{name:"插件更新",exact:true}).click();
 await page.getByRole("button",{name:"查看同步方案",exact:true}).waitFor();
 await page.locator(".creator-update-plugin-card").screenshot({path:path.join(output,"01-source-update.png")});
 await page.getByRole("button",{name:"查看同步方案",exact:true}).click();await page.getByRole("button",{name:"确认更新",exact:true}).waitFor();
 await page.locator(".creator-update-plugin-card").screenshot({path:path.join(output,"02-confirm-sync.png")});
 assert.equal(responses.findLast(r=>r.route.endsWith("/plan"))?.body.requiresMerge,false);
 await page.getByRole("button",{name:"暂不处理",exact:true}).click();
 const original=await readFile(source,"utf8");await writeFile(source,original+"\n// Existing project customization for merge-review acceptance.\n");
 await page.getByRole("button",{name:"刷新官方版本",exact:true}).click();await page.getByText("本地已修改",{exact:true}).waitFor();
 await page.getByRole("button",{name:"查看同步方案",exact:true}).click();await page.getByRole("button",{name:"让 Creator 合并",exact:true}).waitFor();
 assert.equal(responses.findLast(r=>r.route.endsWith("/plan"))?.body.requiresMerge,true);
 await page.locator(".creator-update-plugin-card").screenshot({path:path.join(output,"03-confirm-merge.png")});
 await page.getByRole("button",{name:"自行合并",exact:true}).click();await page.getByRole("button",{name:"验证并完成同步",exact:true}).waitFor();
 await page.locator(".creator-update-plugin-card").screenshot({path:path.join(output,"04-review-merge.png")});
 await page.getByText(/查看代码对比/,{exact:false}).click();
 await page.locator(".creator-source-diff-file").first().locator(":scope > summary").click();
 await page.locator(".creator-update-plugin-card").screenshot({path:path.join(output,"05-optional-code-comparison.png")});
 assert.equal(await readFile(source,"utf8"),original+"\n// Existing project customization for merge-review acceptance.\n");
 assert.deepEqual(errors,[]);assert.equal(await readFile(application,"utf8"),applicationBefore);assert.equal(await readFile(ownerPath,"utf8"),ownerBefore);
 assert(!responses.some(r=>r.route.endsWith("/adopt")||r.route.endsWith("/execute")));
 await page.setViewportSize({width:390,height:1150});await page.locator(".creator-source-diff > summary").click();
 const overflow=await page.locator(".creator-update-page").evaluate((el:HTMLElement)=>({client:el.clientWidth,scroll:el.scrollWidth}));assert(overflow.scroll<=overflow.client+1);
 await page.locator(".creator-update-plugin-card").screenshot({path:path.join(output,"06-narrow-review.png")});
 await writeFile(path.join(output,"verification.json"),JSON.stringify({realCreator:true,realInstalledSnapshots:true,modelCalled:false,sourceSyncApplied:false,applicationAndBaselineUnchanged:true,browserErrors:errors,overflow,responses},null,2));console.log("SOURCE_SYNC_VISUAL_PASS");
} catch(error){if(page){await page.screenshot({path:path.join(output,"failure.png")});await writeFile(path.join(output,"failure.txt"),await page.locator("body").innerText());}throw error;}
finally{await browser?.close();await host.close();await registry.close();await rm(persistent,{recursive:true,force:true});}
