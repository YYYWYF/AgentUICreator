/** Real generated Host + local AG-UI fixture; no external model is invoked. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installOfficialAgentUIResource } from "../packages/operator/src/project/install-official-agent-ui-resource.js";
import { planPluginSourceTakeover, takeoverPluginSource } from "../packages/operator/src/project/takeover-plugin-source.js";
import { createConnectionHostFixture } from "../apps/creator-workbench/tests/support/agent-connection-host.js";
const repo=fileURLToPath(new URL("..",import.meta.url));
const output=path.join(repo,"docs/verification/search-message-plugin-delivery-2026-10-17");await mkdir(output,{recursive:true});
const require=createRequire(path.join(repo,"apps/creator-workbench/package.json"));const {chromium}=require("@playwright/test");const {build}=await import(pathToFileURL(require.resolve("vite")).href);
const fixture=await createConnectionHostFixture({liveModel:false,webSearchCommands:true});let browser;
try {
  fixture.enableCors();
  const ids=["chart-message","source-citations-message","retrieval-chunks","web-search"];
  const installations=[];
  for(const id of ids){const result=await installOfficialAgentUIResource(fixture.hostRoot,id);installations.push({id,changed:result.changed,verification:result.verification?.status??"already-ready"});const marker=JSON.parse(await readFile(path.join(fixture.hostRoot,"src/agent-ui/plugins",id,"application.json"),"utf8"));assert.equal(marker.pluginId,id);}
  const modelPath=path.join(fixture.hostRoot,"src/agent-ui/app-ui/app-ui.json");const model=JSON.parse(await readFile(modelPath,"utf8"));
  for(const id of ids)assert.equal(model.applicationPlugins.filter((plugin:{pluginId:string;enabled:boolean})=>plugin.pluginId===id&&plugin.enabled).length,1);
  const app=path.join(fixture.hostRoot,"src/agent-ui/plugins/web-search/index.tsx");const original=await readFile(app,"utf8");
  const customized=original.replace("<Implementation {...props} />",'<Implementation {...props} searchProps={{...props.searchProps,"aria-label":"thin-search-verification",style:{padding:16,border:"2px solid rgb(139, 92, 246)"}}} />');assert.notEqual(customized,original);await writeFile(app,customized);
  await installOfficialAgentUIResource(fixture.hostRoot,"web-search");assert.equal(await readFile(app,"utf8"),customized);
  const main=path.join(fixture.hostRoot,"src/main.tsx");await writeFile(main,(await readFile(main,"utf8")).replace("<Agent />",`<Agent endpoint=${JSON.stringify(fixture.agentEndpoint)} locale="zh-CN" />`));
  browser=await chromium.launch({headless:true,...(process.platform==="darwin"?{executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}:{})});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(45000);const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  const run=async()=>{const previous=fixture.runCount();const completedBefore=await page.getByText("wire:first wire:finished",{exact:true}).count();const input=page.locator('[contenteditable="true"], textarea').last();await input.waitFor();await input.fill("Verify search message");await input.press("Enter");await page.waitForFunction(()=>document.body.textContent?.includes("wire:first"));for(let i=0;i<100&&fixture.runCount()===previous;i++)await page.waitForTimeout(25);assert.equal(fixture.runCount(),previous+1);fixture.finishRun();await page.getByText("wire:first wire:finished",{exact:true}).nth(completedBefore).waitFor();await page.getByText("Installed search capability",{exact:true}).first().waitFor();await page.locator('[aria-label="thin-search-verification"]').first().waitFor();};
  await page.goto(fixture.hostOrigin);await run();const view=page.locator('[aria-label="thin-search-verification"]').first();assert.equal(await view.evaluate(element=>getComputedStyle(element).padding),"16px");await page.screenshot({path:path.join(output,"generated-host-thin-search.png"),fullPage:true,animations:"disabled"});
  const pkgFile=path.join(fixture.hostRoot,"package.json");const pkg=JSON.parse(await readFile(pkgFile,"utf8"));pkg.scripts={...pkg.scripts,build:"fixture-build"};await writeFile(pkgFile,JSON.stringify(pkg));const applicationBefore=await readFile(app,"utf8");const modelBefore=await readFile(modelPath);
  const plan=await planPluginSourceTakeover(fixture.hostRoot,{pluginId:"web-search"});await takeoverPluginSource(fixture.hostRoot,{pluginId:"web-search",planHash:plan.planHash},async staged=>{await build({root:staged,configFile:false,logLevel:"error",build:{write:false,lib:{entry:path.join(staged,"src/agent-ui/plugins/web-search/definition.ts"),formats:["es"]},rollupOptions:{external:id=>!id.startsWith(".")&&!path.isAbsolute(id)}}});});
  assert.equal(await readFile(app,"utf8"),applicationBefore.replace("@za38.03/agent-ui-plugins/web-search","./source/index"));assert.deepEqual(await readFile(modelPath),modelBefore);
  const source=path.join(fixture.hostRoot,"src/agent-ui/plugins/web-search/source/adapters/web-search.tsx");const beforeSource=await readFile(source,"utf8");const localSource=beforeSource.replace("return <>",'return <section data-source-verification="web-search">').replace("</>;","</section>;");assert.notEqual(localSource,beforeSource);await writeFile(source,localSource);
  await page.reload();await run();await page.locator('[data-source-verification="web-search"] [aria-label="thin-search-verification"]').first().waitFor();assert.equal(await page.locator('[aria-label="thin-search-verification"]').first().evaluate(element=>getComputedStyle(element).padding),"16px");await page.screenshot({path:path.join(output,"generated-host-owned-search.png"),fullPage:true,animations:"disabled"});assert.equal(fixture.runCount(),2);assert.deepEqual(errors,[]);
  await writeFile(path.join(output,"browser.json"),JSON.stringify({mode:"generated-host-real-browser-local-AGUI-fixture-no-model",installations,allFourActivatedOnce:true,reinstallationPreservedApplication:true,applicationPreservedOnTakeover:true,modelPreserved:true,sourceOwnedDOM:true,sourceOwnedSearchRan:true,runCount:fixture.runCount(),padding:"16px",browserErrors:errors},null,2)+"\n");console.log("SEARCH_BROWSER_PASS");
}finally{await browser?.close();await fixture.close();}
