/** Real Creator visual acceptance with an actual local npm feed and artifact plan; no model calls or upgrades. */
import assert from "node:assert/strict";
import {mkdir,readFile,writeFile,rm} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {spawn} from "node:child_process";
import {createLocalReleaseRegistry} from "./support/local-release-registry.mjs";
import {resourcePackageInvocation} from "../packages/operator/src/project/ensure-resource-packages.js";
import {runUpdateCommand} from "../packages/operator/src/updates/npm-artifact.js";
import {createConnectionHostFixture} from "../apps/creator-workbench/tests/support/agent-connection-host.js";
const repo=fileURLToPath(new URL("..",import.meta.url));
const output=process.argv[3] ? path.resolve(process.argv[3]) : path.join(repo,"docs/verification/update-center-simple-2026-10-18");await mkdir(output,{recursive:true});
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
let browser:any,page:any;let registryClosed=false;const errors:string[]=[];const responses:any[]=[];
try {
 browser=await chromium.launch({headless:true,...(process.platform==="darwin"?{executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}:{})});
 page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:"reduce"});page.setDefaultTimeout(45000);
 page.on("pageerror",(error:Error)=>errors.push(error.message));page.on("response",async(response:any)=>{if(new URL(response.url()).pathname.startsWith("/__creator/updates/"))try{responses.push({route:new URL(response.url()).pathname,status:response.status(),body:await response.json()});}catch{}});
 await page.goto(host.creatorOrigin);await page.locator("#creator-request").waitFor({timeout:120000});
 const input=page.frameLocator('iframe[title="Host Application"]').locator('[data-slot="aui_composer-input"]');await input.waitFor({timeout:30000}).catch(async()=>{await page.reload();await input.waitFor({timeout:120000});});
 const separator=page.getByRole("separator");if(await separator.count()){await separator.focus();for(let i=0;i<4;i++)await separator.press("ArrowLeft");}
 await page.getByRole("button",{name:"设置",exact:true}).click();await page.getByRole("button",{name:"插件更新",exact:true}).click();
 await page.getByRole("heading",{name:"更新中心",exact:true}).waitFor();await page.getByText("Composer 新增实时输入字数统计",{exact:false}).first().waitFor();
 await page.getByRole("button",{name:"准备升级",exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>(".creator-prepare-upgrade")?.disabled);
 await page.screenshot({path:path.join(output,"01-real-creator-updates.png"),fullPage:true});await page.locator(".creator-panel").screenshot({path:path.join(output,"02-update-center.png")});
 await page.setViewportSize({width:1440,height:1900});
 const details=page.locator(".creator-update-page details");
 for(let i=0;i<await details.count();i++){const item=details.nth(i);if(!await item.evaluate((el:HTMLDetailsElement)=>el.open))await item.locator(":scope > summary").click();}
 await page.locator(".creator-update-page").evaluate((el:HTMLElement)=>el.scrollTop=0);
 await page.locator(".creator-panel").screenshot({path:path.join(output,"06-all-expanded.png")});
 await writeFile(path.join(output,"06-all-expanded.txt"),await page.locator(".creator-update-page").innerText());
 for(let i=(await details.count())-1;i>=0;i--){const item=details.nth(i);if(await item.evaluate((el:HTMLDetailsElement)=>el.open))await item.locator(":scope > summary").click();}
 await page.setViewportSize({width:1440,height:1050});
 await page.getByRole("button",{name:"准备升级",exact:true}).click();await page.getByRole("heading",{name:"确认升级",exact:true}).waitFor();
 await page.locator(".creator-package-plan").scrollIntoViewIfNeeded();await page.locator(".creator-panel").screenshot({path:path.join(output,"03-confirm-upgrade.png")});
 for(const summary of await page.locator(".creator-package-plan details > summary").all())await summary.click();
 await page.locator(".creator-package-plan").screenshot({path:path.join(output,"07-plan-expanded.png")});
 await page.getByRole("button",{name:"暂不升级",exact:true}).click();
 await page.setViewportSize({width:390,height:980});await page.locator(".creator-panel").screenshot({path:path.join(output,"04-narrow.png")});
 await registry.close();registryClosed=true;await page.getByRole("button",{name:"刷新官方版本",exact:true}).click();await page.getByText("正在显示缓存版本，未能确认最新版本。",{exact:true}).waitFor();await page.locator(".creator-panel").screenshot({path:path.join(output,"05-offline-cache.png")});
 const overflow=await page.locator(".creator-update-page").evaluate((el:HTMLElement)=>({client:el.clientWidth,scroll:el.scrollWidth}));assert(overflow.scroll<=overflow.client+1);assert.deepEqual(errors,[]);
 assert(!responses.some(r=>r.route.endsWith("/packages/execute")));assert.equal(await readFile(path.join(host.hostRoot,"package.json"),"utf8"),initialManifest);assert.equal(await readFile(path.join(host.hostRoot,"package-lock.json"),"utf8"),initialLock);
 await writeFile(path.join(output,"visual-verification.json"),JSON.stringify({realCreator:true,actualLocalCandidateRegistry:true,realArtifactPlan:true,executedInstall:false,browserErrors:errors,overflow,hostRoot:host.hostRoot,responses},null,2));console.log("VISUAL_PASS");
} catch(error) {if(page){await page.screenshot({path:path.join(output,"failure.png")});await writeFile(path.join(output,"failure.txt"),await page.locator("body").innerText());}throw error;}
finally{await browser?.close();await host.close();if(!registryClosed)await registry.close();}
