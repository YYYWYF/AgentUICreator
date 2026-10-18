/** Real generated Host/browser with local HTTP AG-UI data; no external model. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensurePluginApplication } from "../packages/operator/src/project/plugin-application.js";
import { planPluginSourceTakeover, takeoverPluginSource } from "../packages/operator/src/project/takeover-plugin-source.js";
import { createConnectionHostFixture } from "../apps/creator-workbench/tests/support/agent-connection-host.js";
const repo=fileURLToPath(new URL("..",import.meta.url));
const output=path.join(repo,"docs/verification/conversation-plugin-delivery-2026-10-17");await mkdir(output,{recursive:true});
const require=createRequire(path.join(repo,"apps/creator-workbench/package.json"));const {chromium}=require("@playwright/test");const {build}=await import(pathToFileURL(require.resolve("vite")).href);
const fixture=await createConnectionHostFixture({liveModel:false,mode:"assistant"});let browser; let page; const errors:string[]=[];
try {
  fixture.enableCors();const ids=["conversation-thread-list","conversation-history","conversation-new","conversation-quote"];const installations=[];
  for(const id of ids){const result=await ensurePluginApplication(fixture.hostRoot,id);installations.push({id,changed:result.changed,delivery:"initialized-application"});assert.equal(JSON.parse(await readFile(path.join(fixture.hostRoot,"src/agent-ui/plugins",id,"application.json"),"utf8")).pluginId,id);}
  const app=path.join(fixture.hostRoot,"src/agent-ui/plugins/conversation-thread-list/index.tsx");const original=await readFile(app,"utf8");
  const customized=original.replace("{...props} />",'{...props} rootProps={{"aria-label":"thin-list-verification",style:{padding:16,border:"2px solid rgb(139, 92, 246)"}}} />');assert.notEqual(customized,original);await writeFile(app,customized);
  await ensurePluginApplication(fixture.hostRoot,"conversation-thread-list");assert.equal(await readFile(app,"utf8"),customized);
  const main=path.join(fixture.hostRoot,"src/main.tsx");await writeFile(main,(await readFile(main,"utf8")).replace("<Agent />",`<Agent endpoint=${JSON.stringify(fixture.agentEndpoint)} locale="zh-CN" />`));
  browser=await chromium.launch({headless:true,...(process.platform==="darwin"?{executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(45000);page.on("pageerror",error=>errors.push(error.message));
  await page.goto(fixture.hostOrigin);
  await page.locator(".agent-ui-assistant-trigger").click();
  const list=page.locator('[aria-label="thin-list-verification"]').first();
  // The platform sidebar opens its selected conversation section on demand.
  if(!await list.isVisible()){const toggle=page.locator('[data-ui-plugin="conversation-history"] button').first();await toggle.click();}
  await list.waitFor();assert.equal(await list.evaluate(element=>getComputedStyle(element).padding),"16px");
  await page.locator('[data-ui-plugin="conversation-history"] button').first().click();
  const input=page.locator('[contenteditable="true"], textarea').last();await input.waitFor();await input.fill("Verify conversation plugin delivery");await input.press("Enter");await page.getByText("wire:first",{exact:true}).waitFor();fixture.finishRun();await page.getByText("wire:first wire:finished",{exact:true}).waitFor();
  await page.locator('[data-ui-plugin="conversation-history"] button').first().click();await list.waitFor();
  await page.locator(".agent-ui-assistant-panel").screenshot({path:path.join(output,"generated-host-thin-conversation.png"),animations:"disabled"});
  const pkgFile=path.join(fixture.hostRoot,"package.json");const pkg=JSON.parse(await readFile(pkgFile,"utf8"));pkg.scripts={...pkg.scripts,build:"fixture-build"};await writeFile(pkgFile,JSON.stringify(pkg));
  const applicationBefore=await readFile(app,"utf8");const modelPath=path.join(fixture.hostRoot,"src/agent-ui/app-ui/app-ui.json");const modelBefore=await readFile(modelPath);
  const plan=await planPluginSourceTakeover(fixture.hostRoot,{pluginId:"conversation-thread-list"});await takeoverPluginSource(fixture.hostRoot,{pluginId:"conversation-thread-list",planHash:plan.planHash},async staged=>{await build({root:staged,configFile:false,logLevel:"error",build:{write:false,lib:{entry:path.join(staged,"src/agent-ui/plugins/conversation-thread-list/definition.ts"),formats:["es"]},rollupOptions:{external:id=>!id.startsWith(".")&&!path.isAbsolute(id)}}});});
  assert.equal(await readFile(app,"utf8"),applicationBefore.replace("@za38.03/agent-ui-plugins/conversation-thread-list","./source/index"));assert.deepEqual(await readFile(modelPath),modelBefore);
  const source=path.join(fixture.hostRoot,"src/agent-ui/plugins/conversation-thread-list/source/adapters/conversation-thread-list.tsx");const beforeSource=await readFile(source,"utf8");const localSource=beforeSource.replace('data-ui-plugin="conversation-thread-list"','data-ui-plugin="conversation-thread-list" data-source-verification="conversation-thread-list"');assert.notEqual(localSource,beforeSource);await writeFile(source,localSource);
  await page.reload();await page.locator(".agent-ui-assistant-trigger").click();if(!await list.isVisible())await page.locator('[data-ui-plugin="conversation-history"] button').first().click();await page.locator('[data-source-verification="conversation-thread-list"]').waitFor();assert.equal(await list.evaluate(element=>getComputedStyle(element).padding),"16px");
  const rail=await readFile(path.join(fixture.hostRoot,"src/agent-ui/plugins/conversation-thread-list/definition.ts"),"utf8");assert.ok(rail.includes("RailAction: ConversationThreadListRailAction"));
  await page.locator(".agent-ui-assistant-panel").screenshot({path:path.join(output,"generated-host-owned-conversation.png"),animations:"disabled"});assert.deepEqual(errors,[]);
  await writeFile(path.join(output,"browser.json"),JSON.stringify({mode:"generated-host-real-browser-local-AGUI-fixture-no-model",installations,reinstallationPreservedApplication:true,applicationPreservedOnTakeover:true,modelPreserved:true,sourceOwnedDOM:true,railActionRetained:true,runCount:fixture.runCount(),padding:"16px",browserErrors:errors},null,2)+"\n");console.log("CONVERSATION_BROWSER_PASS");
}catch(error){if(page){console.error("BROWSER_ERRORS",JSON.stringify(errors));console.error("BROWSER_BODY",(await page.locator("body").innerText()).slice(0,4500));await page.screenshot({path:"/tmp/conversation-browser-failure.png",fullPage:true});}throw error;}finally{await browser?.close();await fixture.close();}
