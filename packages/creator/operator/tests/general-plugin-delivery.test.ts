// @vitest-environment node
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { build } from "vite";
import { transform } from "esbuild";
import { repositoryRoot } from "./support/generated-project";
import { ensurePluginApplication } from "../src/project/plugin-application";
import { planPluginSourceTakeover, takeoverPluginSource, planPluginSourceSync, syncPluginSource } from "../src/project/takeover-plugin-source";
import { resourcePaths } from "../src/project/optional-resource-paths";
import { readPluginSourceOwnership } from "../src/project/plugin-source-ownership";
import { generatePluginRegistry } from "../src/project/registry-generator";
import { parseUIPluginManifest } from "../src/framework/contracts/ui-plugin";
import { parseAppUIModelJson } from "../src/framework/contracts/app-ui-model";
import { officialPackagePlugins } from "../src/source-catalog/index.js";
import { writeGeneratedPluginRegistry } from "../src/generate-plugin-registry";
import { verifyPluginChildSlots } from "../src/project/plugin-child-slot-verifier";
const ids = officialPackagePlugins.filter(plugin=>plugin.pluginId!=="composer").map(plugin=>plugin.pluginId);
const roots: string[] = [];
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(id: string) {
  const root = await mkdtemp(path.join(tmpdir(), "plugin delivery 空格-")); roots.push(root);
  for (const directory of [".agent-ui", "src/ui/app-ui", "src/ui/plugins", "src/ui/runtime", "src/ui/agent-ui/i18n", "src/ui/agent-ui/theme", "src/ui/services", "node_modules/@za38.03"]) await mkdir(path.join(root, directory), { recursive: true });
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({mode:"assistant",sourceRoot:"src/ui"}));
  await writeFile(path.join(root,"package.json"), JSON.stringify({ name:"plugin-delivery-fixture", type:"module", testPluginId:id, scripts:{typecheck:"tsc",build:"vite build"} }));
  await writeFile(path.join(root,"tsconfig.json"), JSON.stringify({compilerOptions:{target:"ES2022",module:"ESNext",moduleResolution:"Bundler",jsx:"react-jsx",strict:true,skipLibCheck:true,resolveJsonModule:true,esModuleInterop:true,types:["vite/client"],noEmit:true},include:[`src/ui/plugins/${id}/**/*`]}));
  const installed = path.join(root,"node_modules/@za38.03/agent-ui-plugins"); await mkdir(installed,{recursive:true});
  await cp(path.join(repositoryRoot,"packages/plugins/package.json"),path.join(installed,"package.json"));
  await cp(path.join(repositoryRoot,"packages/plugins/dist"),path.join(installed,"dist"),{recursive:true});
  const junction = process.platform === "win32" ? "junction" : "dir";
  await symlink(path.join(repositoryRoot,"packages/plugins/node_modules"),path.join(installed,"node_modules"),junction);
  for (const dependency of ["react","@types","zod","vite","lucide-react"]) await symlink(path.join(repositoryRoot,dependency==="lucide-react"?"packages/plugins/node_modules":"packages/creator/node_modules",dependency),path.join(root,"node_modules",dependency),junction);
  for (const dependency of ["core", "renderer", "runtime"]) await symlink(path.join(repositoryRoot,"packages",dependency),path.join(root,"node_modules/@za38.03",`agent-ui-${dependency}`),junction);
  await cp(path.join(repositoryRoot,"packages/plugins/resources/registry/items/foundation/core-contracts/files/framework"),path.join(root,"src/ui/framework"),{recursive:true});
  await cp(path.join(repositoryRoot,"packages/plugins/resources/registry/items/foundation/core-runtime/files/runtime/context"),path.join(root,"src/ui/runtime/context"),{recursive:true});
  await cp(path.join(repositoryRoot,"packages/plugins/resources/registry/items/foundation/core-application/files/services/conversations"),path.join(root,"src/ui/services/conversations"),{recursive:true});
  await cp(path.join(repositoryRoot,"packages/plugins/resources/registry/items/foundation/core-application/files/services/conversations.ts"),path.join(root,"src/ui/services/conversations.ts"));
  await cp(path.join(repositoryRoot,"packages/plugins/resources/registry/items/foundation/core-application/files/services/agent-ui-theme.ts"),path.join(root,"src/ui/services/agent-ui-theme.ts"));
  await cp(path.join(repositoryRoot,"packages/plugins/resources/registry/items/foundation/core-adapters/files/agent-ui/theme"),path.join(root,"src/ui/agent-ui/theme"),{recursive:true});
  await writeFile(path.join(root,"src/ui/services/agent-ui-locale.ts"),'export const AGENT_UI_LOCALE_SERVICE = "agent-ui.locale";');
  await writeFile(path.join(root,"src/ui/agent-ui/i18n/useAgentUILocale.ts"),'export { useAgentUILocale } from "@za38.03/agent-ui-plugins";');
  await writeFile(path.join(root,"src/ui/runtime/composition.ts"),'export const createPluginCapabilityCatalog = (entries: unknown[]) => entries;');
  await writeFile(path.join(root,"src/ui/runtime/plugins.tsx"),'import {createContext,useContext} from "react"; const Context=createContext<{kind:string;value:unknown}|null>(null); export function usePluginServiceRuntime(){return {subscribe:(_listener:()=>void)=>()=>{},getRevision:()=>0,slots:{getContributions:(_slot:string):{instanceId:string}[]=>[],subscribe:(_listener:()=>void)=>()=>{}},getActivation:(_id:string)=>({status:"active" as const})};} export function usePluginService<T>(_id:string):T|undefined{return undefined;} export function usePluginServiceSnapshot<T>(service:{getSnapshot():T}|undefined,fallback:T):T{return service?.getSnapshot() ?? fallback;} export const PluginRenderScopeProvider=Context.Provider; export function usePluginRenderScope<T>() {return useContext(Context) as {kind:string;value:T}|null;}');
  if (officialPackagePlugins.find(plugin=>plugin.pluginId===id)?.application.hostApplication) {
    for (const resource of ["foundation-core", "foundation-core-application", "foundation-core-adapters"]) {
      const files=path.join(repositoryRoot,"packages/plugins/resources/registry/items",resource,"files");
      for(const folder of ["application","services","agent-ui"]){try{await cp(path.join(files,folder),path.join(root,"src/ui",folder),{recursive:true});}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}}
    }
  }
  const fixtureManifest = parseUIPluginManifest(officialPackagePlugins.find(plugin=>plugin.pluginId===id)!.manifest);
  const instance = {id:"existing-instance",pluginId:id,enabled:true};
  const headless = fixtureManifest.capabilities?.includes("headless") || fixtureManifest.data?.messageUI === true || fixtureManifest.application?.gate !== undefined;
  await writeFile(path.join(root,"src/ui/app-ui/app-ui.json"),JSON.stringify(headless ? {root:{type:"slot",plugins:[]},applicationPlugins:[instance]} : {root:{type:"slot",plugins:[instance]}}));
  if (fixtureManifest.requiresRenderScope) {
    const host=path.join(root,"src/ui/plugins/test-host"); await mkdir(host);
    const capability=fixtureManifest.capabilities![0];
    await writeFile(path.join(host,"manifest.json"),JSON.stringify({id:"test-host",name:"Host",version:"0.0.1",description:"Scoped fixture",slots:{children:{group:{description:"Runtime group",cardinality:"one",mode:"renderer",accepts:{anyOfCapabilities:[capability]}}}}}));
    await writeFile(path.join(host,"definition.ts"),'import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin"; import manifest from "./manifest.json"; const definition:UIPluginDefinition={manifest,Component:()=>null};export default definition;');
    await writeFile(path.join(root,"src/ui/app-ui/app-ui.json"),JSON.stringify({root:{type:"slot",plugins:[{id:"scope-host",pluginId:"test-host",enabled:true,slots:{group:[{id:"existing-instance",pluginId:id,enabled:true}]}}]}}));
  }
  return {root,installed};
}
async function validate(staged: string, command: {args: string[]}) {
  const { paths } = await resourcePaths(staged);
  const id = JSON.parse(await readFile(path.join(staged,"package.json"),"utf8")).testPluginId;
  if (command.args.at(-1) === "typecheck") {
    const require = createRequire(path.join(repositoryRoot,"packages/creator/package.json"));
    const compiler = path.join(path.dirname(require.resolve("typescript/package.json")),"bin/tsc");
    try { execFileSync(process.execPath,[compiler,"--noEmit","-p",path.join(staged,"tsconfig.json")],{cwd:staged,stdio:"pipe"}); } catch (error) { throw new Error(String((error as {stdout?:Buffer}).stdout) + String((error as {stderr?:Buffer}).stderr), {cause:error}); }
  } else await build({root:staged,configFile:false,logLevel:"error",build:{write:false,lib:{entry:path.join(paths.pluginsRoot,id,"definition.ts"),formats:["es"]},rollupOptions:{external:id=>!id.startsWith(".")&&!path.isAbsolute(id)}}});
}
it.each(ids)("%s retains application and local adapters across exact-version takeover and merge", async id => {
  const {root,installed} = await fixture(id); const ctx = await resourcePaths(root);
  const modelBefore = await readFile(ctx.paths.appUIModelPath);
  await ensurePluginApplication(root,id);
  const appPath = path.join(ctx.paths.pluginsRoot,id,"index.tsx");
  const initialApplication = await readFile(appPath,"utf8");
  const customizedApplication = ["tool-fallback", "transient-assistant-messages"].includes(id) ? initialApplication.replace("<Implementation {...scope.value} {...props} />", '<Implementation {...scope.value} {...props} rootProps={{"aria-label":"kept custom application",style:{padding:17}}} />') : initialApplication;
  const option = ({"agent-status-message":"statusProps", "agent-plan-message":"planProps", "job-progress-message":"progressProps", "generated-file-message":"fileProps", "chart-message":"rootProps", "source-citations-message":"rootProps", "retrieval-chunks":"retrievalProps", "web-search":"searchProps", "conversation-thread-list":"rootProps", "conversation-new":"rootProps", "conversation-quote":"previewProps", "agent-identity":"rootProps", "auth-account":"rootProps", "auth-gate":"rootProps", "conversation-surface":"rootProps", "theme-switch":"rootProps"} as Record<string,string>)[id];
  const messageApplication = option ? customizedApplication.replace("{...props} />", `{...props} ${option}={${option === "previewProps" ? '{dismissLabel:"kept custom application"}' : option === "fileProps" ? '{filename:"kept custom filename"}' : '{style:{padding:17},"aria-label":"kept message customization"}'}} />`) : customizedApplication;
  const app = messageApplication+'\n// user application customization: 必须保留\n';
  await writeFile(appPath,app.replaceAll("\n","\r\n"));
  const applicationExtras = new Map<string,Buffer>();
  const installedCatalog = JSON.parse(await readFile(path.join(installed,"dist/catalog.json"),"utf8"));
  for(const file of installedCatalog.plugins.find((plugin:{id:string})=>plugin.id===id)?.application?.files ?? []) if(!["index.tsx","definition.ts"].includes(file.target)){const target=path.join(ctx.paths.pluginsRoot,id,...file.target.split("/"));await writeFile(target,(await readFile(target,"utf8"))+"\n// preserved application configuration\n");applicationExtras.set(target,await readFile(target));}
  const originalApp = await readFile(appPath,"utf8");
  await ensurePluginApplication(root,id); expect(await readFile(appPath,"utf8")).toBe(originalApp);
  const packageGeneration=await generatePluginRegistry(root,parseAppUIModelJson(modelBefore.toString()),ctx);
  expect(await verifyPluginChildSlots(root,packageGeneration.assets.filter(asset=>asset.pluginId===id))).toEqual([]);
  expect(packageGeneration.errors).toEqual([]);
  const registration = officialPackagePlugins.find(plugin=>plugin.pluginId===id)!.application.registration;
  if (registration?.kind === "data") expect(packageGeneration.assets.find(asset=>asset.pluginId===id)?.dataMessageUINames).toEqual([registration.name]);
  if (registration) expect(await readFile(path.join(ctx.paths.pluginsRoot,id,"definition.ts"),"utf8")).toContain(JSON.stringify(registration.name));
  await validate(root,{args:["run","typecheck"]}); await validate(root,{args:["run","build"]});
  const plan = await planPluginSourceTakeover(root,{pluginId:id});
  expect(plan.compatibility).toEqual({pluginSupport:1}); expect(plan.instances).toEqual(["existing-instance"]);
  await expect(readFile(path.join(ctx.paths.metadataRoot,"plugin-ownership.json"))).rejects.toMatchObject({code:"ENOENT"});
  await takeoverPluginSource(root,{pluginId:id,planHash:plan.planHash},validate);
  const application = await readFile(appPath);
  expect(application.toString()).toBe(originalApp.replaceAll(`@za38.03/agent-ui-plugins/${id}`,"./source/index"));
  const owner = (await readPluginSourceOwnership(ctx.paths.metadataRoot)).plugins[id]!;
  expect(Object.keys(owner.base).every(file=>file.startsWith("source/"))).toBe(true);
  const sourcePath = path.join(ctx.paths.pluginsRoot,id,"source/adapters",`${id}.tsx`);
  const original = await readFile(sourcePath,"utf8"); await writeFile(sourcePath,original+'\n// user implementation customization\n');
  const local = await readFile(sourcePath); const ownerBefore = await readFile(path.join(ctx.paths.metadataRoot,"plugin-ownership.json"));
  const hasStyles = await readFile(path.join(ctx.paths.pluginsRoot,id,"source/styles.css")).then(()=>true,error=>{if(error.code==="ENOENT")return false;throw error;});
  const extraTarget = id === "chart-message" ? "style.css" : hasStyles ? "styles.css" : id === "theme-provider" ? "adapters/theme-service.ts" : id === "locale-provider" ? "adapters/locale-service.ts" : id === "thinking-indicator" ? "adapters/policy.ts" : officialPackagePlugins.find(plugin=>plugin.pluginId===id)?.application.registration ? "adapters/projection.ts" : undefined;
  const extraCss = extraTarget?.endsWith(".css") === true;
  const extraPath = extraTarget ? path.join(ctx.paths.pluginsRoot,id,"source",...extraTarget.split("/")) : undefined;
  const extraOriginal = extraPath ? await readFile(extraPath,"utf8") : undefined;
  const extraLocal = extraOriginal === undefined ? undefined : extraOriginal + "\n/* preserved extra customization */\n";
  const extraUpdate = extraOriginal === undefined ? undefined : extraOriginal + (extraCss ? "\n.source-update-feature { opacity: 0.9; }\n" : "\nexport const sourcePolicyUpdateFeature = true;\n");
  if (extraPath) await writeFile(extraPath,extraLocal!);
  const catalogFile=path.join(installed,"dist/catalog.json");const catalog=JSON.parse(await readFile(catalogFile,"utf8"));
  const pkg=JSON.parse(await readFile(path.join(installed,"package.json"),"utf8")); pkg.version=catalog.package.version="0.0.2";
  const record=catalog.plugins.find((entry:{id:string})=>entry.id===id); record.version="0.0.2";
  const target = original+'\nexport const sourceUpdateFeature = true;\n';
  for (const file of record.takeover.files) if (file.target === `adapters/${id}.tsx` || file.target === "manifest.json") {
    const text = file.target === "manifest.json" ? JSON.stringify({...JSON.parse(await readFile(path.join(installed,"dist",file.path),"utf8")),version:"0.0.2"}) : target;
    await writeFile(path.join(installed,"dist",file.path),text); file.sha256=digest(text);
  }
  const runtime = record.takeover.runtimeFiles.find((file:{path:string})=>file.path===`plugins/${id}/adapters/presentation/${id}.js`);
  const compiled=await transform(target,{loader:"tsx",jsx:"automatic",format:"esm"});await writeFile(path.join(installed,"dist",runtime.path),compiled.code);runtime.sha256=digest(compiled.code);
  if (extraTarget) {
    const snapshot=record.takeover.files.find((file:{target:string})=>file.target===extraTarget);
    await writeFile(path.join(installed,"dist",snapshot.path),extraUpdate!);snapshot.sha256=digest(extraUpdate!);
    const extraRuntime=record.takeover.runtimeFiles.find((file:{path:string})=>file.path===(extraCss?`${id}/index.css`:`plugins/${id}/adapters/presentation/${path.posix.basename(extraTarget).replace(/\.tsx?$/u, "")}.js`));
    const bytes=extraCss?extraUpdate!:(await transform(extraUpdate!,{loader:"ts",format:"esm"})).code;
    await writeFile(path.join(installed,"dist",extraRuntime.path),bytes);extraRuntime.sha256=digest(bytes);
  }
  await writeFile(path.join(installed,"package.json"),JSON.stringify(pkg)); await writeFile(catalogFile,JSON.stringify(catalog));
  await ensurePluginApplication(root,id);
  expect(await readFile(appPath)).toEqual(application); expect(await readFile(sourcePath)).toEqual(local); expect(await readFile(path.join(ctx.paths.metadataRoot,"plugin-ownership.json"))).toEqual(ownerBefore);
  if (extraPath) expect(await readFile(extraPath,"utf8")).toBe(extraLocal);
  const sync=await planPluginSourceSync(root,{pluginId:id});
  expect(sync.files.every(file=>file.startsWith(`plugins/${id}/source/`))).toBe(true);
  await expect(syncPluginSource(root,{pluginId:id,planHash:sync.planHash},validate)).rejects.toMatchObject({code:"PLUGIN_SOURCE_MERGE_REQUIRED"});
  const resolutions:Record<string,string>={[`adapters/${id}.tsx`]:target+'\n// user implementation customization\n'};
  if (extraTarget) resolutions[extraTarget]=extraUpdate!+"\n/* preserved extra customization */\n";
  await syncPluginSource(root,{pluginId:id,planHash:sync.planHash,resolutions},validate);
  expect(await readFile(appPath)).toEqual(application); expect(await readFile(ctx.paths.appUIModelPath)).toEqual(modelBefore);
  expect(await readFile(sourcePath,"utf8")).toContain("user implementation customization"); expect(await readFile(sourcePath,"utf8")).toContain("sourceUpdateFeature");
  if (extraPath) {const merged=await readFile(extraPath,"utf8");expect(merged).toContain("preserved extra customization");expect(merged).toContain(extraCss?"source-update-feature":"sourcePolicyUpdateFeature");}
  for(const [file,bytes] of applicationExtras)expect(await readFile(file)).toEqual(bytes);
  expect((await readPluginSourceOwnership(ctx.paths.metadataRoot)).plugins[id]!.package.version).toBe("0.0.2");
  const generation=await generatePluginRegistry(root,parseAppUIModelJson(modelBefore.toString()),ctx);
  expect(generation.errors).toEqual([]);expect(generation.assets.filter(asset=>asset.pluginId===id)).toHaveLength(1);
  if (registration?.kind === "data") expect(generation.assets.find(asset=>asset.pluginId===id)?.dataMessageUINames).toEqual([registration.name]);
  expect(await verifyPluginChildSlots(root,generation.assets.filter(asset=>asset.pluginId===id))).toEqual([]);
  if (registration || officialPackagePlugins.find(plugin=>plugin.pluginId===id)?.application.hostBindings?.length || officialPackagePlugins.find(plugin=>plugin.pluginId===id)?.application.hostApplication) {
    const beforeCatalog = await readFile(catalogFile);const beforeOwnership = await readFile(path.join(ctx.paths.metadataRoot,"plugin-ownership.json"));
    const changed = JSON.parse(beforeCatalog.toString());const contract = changed.plugins.find((plugin:{id:string})=>plugin.id===id).application; if(registration) contract.registration.name="incompatible-route"; else if(contract.hostApplication)contract.hostApplication=false;else contract.hostBindings=[];await writeFile(catalogFile,JSON.stringify(changed));
    await expect(planPluginSourceSync(root,{pluginId:id})).rejects.toMatchObject({code:"PLUGIN_SOURCE_APPLICATION_API_CHANGED"});
    expect(await readFile(appPath)).toEqual(application);expect(await readFile(path.join(ctx.paths.metadataRoot,"plugin-ownership.json"))).toEqual(beforeOwnership);await writeFile(catalogFile,beforeCatalog);
  }
},90000);
it("a thin footer must forward renderSlot rather than silently dropping its semantic actions",async()=>{
  const {root}=await fixture("response-footer");await ensurePluginApplication(root,"response-footer");const ctx=await resourcePaths(root);
  const app=path.join(ctx.paths.pluginsRoot,"response-footer/index.tsx");await writeFile(app,(await readFile(app,"utf8")).replace("<Implementation {...props} />","<Implementation {...props} renderSlot={() => null} />"));
  const generation=await generatePluginRegistry(root,parseAppUIModelJson(await readFile(ctx.paths.appUIModelPath,"utf8")),ctx);
  expect(await verifyPluginChildSlots(root,generation.assets.filter(asset=>asset.pluginId==="response-footer"))).toEqual(expect.arrayContaining([expect.objectContaining({code:"plugin-child-slot-declared-not-rendered",pluginId:"response-footer",slot:"actions"})]));
});
it("catalog exposes only the declared migrated batches",()=>{
  expect(officialPackagePlugins.map(plugin=>plugin.pluginId)).toEqual(expect.arrayContaining(["composer",...ids]));
  expect(officialPackagePlugins.every(plugin=>plugin.application.enabled)).toBe(true);
});
it("an older installed catalog does not gain unavailable package entries or application files",async()=>{
  const {root,installed}=await fixture("composer");
  const catalogFile=path.join(installed,"dist/catalog.json");
  const catalog=JSON.parse(await readFile(catalogFile,"utf8"));
  for(const plugin of catalog.plugins) if(ids.includes(plugin.id)) {delete plugin.takeover;delete plugin.application;}
  await writeFile(catalogFile,JSON.stringify(catalog));
  await writeGeneratedPluginRegistry(root);
  for(const id of ids) await expect(readFile(path.join(root,"src/ui/plugins",id,"application.json"))).rejects.toMatchObject({code:"ENOENT"});
  const ctx=await resourcePaths(root);
  const generation=await generatePluginRegistry(root,parseAppUIModelJson(await readFile(ctx.paths.appUIModelPath,"utf8")),ctx);
  expect(generation.errors).toEqual([]);
  expect(generation.assets.filter(asset=>ids.includes(asset.pluginId))).toEqual([]);
});
it("unsupported installed delivery and incompatible support never grant ownership or overwrite the application",async()=>{
  const {root,installed}=await fixture("copy-action");const catalogFile=path.join(installed,"dist/catalog.json");const original=await readFile(catalogFile);const catalog=JSON.parse(original.toString());const plugin=catalog.plugins.find((entry:{id:string})=>entry.id==="copy-action");delete plugin.application;
  await writeFile(catalogFile,JSON.stringify(catalog));await expect(ensurePluginApplication(root,"copy-action")).rejects.toThrow("PLUGIN_APPLICATION_PACKAGE_API_UNSUPPORTED");
  await expect(readFile(path.join(root,"src/ui/plugins/copy-action/application.json"))).rejects.toMatchObject({code:"ENOENT"});
  await writeFile(catalogFile,original);await ensurePluginApplication(root,"copy-action");const application=await readFile(path.join(root,"src/ui/plugins/copy-action/index.tsx"));const valid=JSON.parse(original.toString());valid.sharedApis.pluginSupport=2;await writeFile(catalogFile,JSON.stringify(valid));
  await expect(planPluginSourceTakeover(root,{pluginId:"copy-action"})).rejects.toMatchObject({code:"PLUGIN_SOURCE_INCOMPATIBLE"});expect(await readFile(path.join(root,"src/ui/plugins/copy-action/index.tsx"))).toEqual(application);
  await expect(readFile(path.join(root,".agent-ui/plugin-ownership.json"))).rejects.toMatchObject({code:"ENOENT"});
});
it.each(ids.flatMap(id=>[true,false].map(locked=>({id,locked}))))("$id keeps customized legacy code (source lock: $locked)",async({id,locked})=>{
  const {root}=await fixture(id);const ctx=await resourcePaths(root);const directory=path.join(ctx.paths.pluginsRoot,id);await mkdir(directory);
  const manifest={...officialPackagePlugins.find(plugin=>plugin.pluginId===id)!.manifest,name:"Custom "+id};const registration = officialPackagePlugins.find(plugin=>plugin.pluginId===id)!.application.registration;
  const definition='import type {UIPluginDefinition} from "../../framework/contracts/ui-plugin";import manifest from "./manifest.json";'+(registration?.kind==="data"?'import {defineDataMessageUI} from "@za38.03/agent-ui-plugins";':'')+`export default {manifest,provides:${JSON.stringify(officialPackagePlugins.find(plugin=>plugin.pluginId===id)!.services.provides)},${registration?.kind==="data"?`dataMessageUIs:[defineDataMessageUI({name:${JSON.stringify(registration.name)},render:()=>null})],`:""}Component:()=>null} satisfies UIPluginDefinition;`;
  await writeFile(path.join(directory,"manifest.json"),JSON.stringify(manifest));await writeFile(path.join(directory,"definition.ts"),definition);await writeFile(path.join(directory,"index.tsx"),"// local pre-migration customization\n");
  if (locked) await writeFile(ctx.paths.sourceLockPath,JSON.stringify({sourceRoot:"src/ui",items:{[`plugin/${id}`]:{files:{[`plugins/${id}/index.tsx`]:{sha256:digest("official baseline")}}}}}));
  expect(await ensurePluginApplication(root,id)).toEqual({changed:false});expect(await readFile(path.join(directory,"index.tsx"),"utf8")).toBe("// local pre-migration customization\n");
  await expect(readFile(path.join(directory,"application.json"))).rejects.toMatchObject({code:"ENOENT"});
  await expect(readFile(path.join(ctx.paths.metadataRoot,"plugin-ownership.json"))).rejects.toMatchObject({code:"ENOENT"});
  const generation=await generatePluginRegistry(root,parseAppUIModelJson(await readFile(ctx.paths.appUIModelPath,"utf8")),ctx);expect(generation.errors).toEqual([]);expect(generation.assets.find(asset=>asset.pluginId===id)?.name).toBe("Custom "+id);expect(generation.capabilityCatalog.source).toContain(`./${id}/definition`);
});

it.each(["agent-status-message","agent-plan-message","job-progress-message","generated-file-message","chart-message","source-citations-message","retrieval-chunks","web-search"])("%s rejects installed registration drift before writing application code",async id=>{
  const {root,installed}=await fixture(id);const catalogFile=path.join(installed,"dist/catalog.json");const catalog=JSON.parse(await readFile(catalogFile,"utf8"));const plugin=catalog.plugins.find((plugin:{id:string})=>plugin.id===id);plugin.application.registration.name="changed-name";await writeFile(catalogFile,JSON.stringify(catalog));
  await expect(ensurePluginApplication(root,id)).rejects.toThrow("PLUGIN_APPLICATION_PACKAGE_API_UNSUPPORTED");await expect(readFile(path.join(root,"src/ui/plugins",id,"application.json"))).rejects.toMatchObject({code:"ENOENT"});
});
it("job progress rejects missing installed Runtime binding rather than silently losing live progress",async()=>{
  const {root,installed}=await fixture("job-progress-message");const catalogFile=path.join(installed,"dist/catalog.json");const catalog=JSON.parse(await readFile(catalogFile,"utf8"));catalog.plugins.find((plugin:{id:string})=>plugin.id==="job-progress-message").application.runtimeContext=false;await writeFile(catalogFile,JSON.stringify(catalog));await expect(ensurePluginApplication(root,"job-progress-message")).rejects.toThrow("PLUGIN_APPLICATION_PACKAGE_API_UNSUPPORTED");
});
it("historical application ownership without a contract hash keeps compatible source sync available",async()=>{
  const id="copy-action";const {root}=await fixture(id);await ensurePluginApplication(root,id);const ctx=await resourcePaths(root);const plan=await planPluginSourceTakeover(root,{pluginId:id});await takeoverPluginSource(root,{pluginId:id,planHash:plan.planHash},validate);
  const file=path.join(ctx.paths.metadataRoot,"plugin-ownership.json");const owner=JSON.parse(await readFile(file,"utf8"));delete owner.plugins[id].applicationContractHash;await writeFile(file,JSON.stringify(owner));
  await expect(planPluginSourceSync(root,{pluginId:id})).resolves.toMatchObject({pluginId:id});
},30000);
it.each([
  {id:"conversation-thread-list",field:"railAction",value:"IncompatibleRail"},
  {id:"conversation-thread-list",field:"hostBindings",value:["conversation-list"]},
  {id:"conversation-thread-list",field:"hostBindings",value:["conversation-selection"]},
])("$id refuses changed $field before initializing or taking over",async({id,field,value})=>{
  const {root,installed}=await fixture(id);const ctx=await resourcePaths(root);const file=path.join(installed,"dist/catalog.json");const initial=await readFile(file);const catalog=JSON.parse(initial.toString());catalog.plugins.find((plugin:{id:string})=>plugin.id===id).application[field]=value;await writeFile(file,JSON.stringify(catalog));
  await expect(ensurePluginApplication(root,id)).rejects.toThrow("PLUGIN_APPLICATION_PACKAGE_API_UNSUPPORTED");await expect(readFile(path.join(ctx.paths.pluginsRoot,id,"application.json"))).rejects.toMatchObject({code:"ENOENT"});
  await writeFile(file,initial);await ensurePluginApplication(root,id);
  const app=await readFile(path.join(ctx.paths.pluginsRoot,id,"index.tsx"));
  if(id==="conversation-thread-list")expect(await readFile(path.join(ctx.paths.pluginsRoot,id,"definition.ts"),"utf8")).toContain("RailAction: ConversationThreadListRailAction");
  await writeFile(file,JSON.stringify(catalog));await expect(planPluginSourceTakeover(root,{pluginId:id})).rejects.toThrow("PLUGIN_APPLICATION_PACKAGE_API_UNSUPPORTED");expect(await readFile(path.join(ctx.paths.pluginsRoot,id,"index.tsx"))).toEqual(app);
});
it.each(["agent-identity","auth-gate","theme-provider"])("%s validates installed application template digests before any write",async id=>{
 const {root,installed}=await fixture(id);const ctx=await resourcePaths(root);const catalog=JSON.parse(await readFile(path.join(installed,"dist/catalog.json"),"utf8"));const template=catalog.plugins.find((plugin:{id:string})=>plugin.id===id).application.files.find((file:{target:string})=>file.target==="index.tsx");await writeFile(path.join(installed,"dist",...template.path.split("/")),"// tampered template\n");
 await expect(ensurePluginApplication(root,id)).rejects.toThrow("PLUGIN_APPLICATION_TEMPLATE_INTEGRITY");await expect(readFile(path.join(ctx.paths.pluginsRoot,id,"application.json"))).rejects.toMatchObject({code:"ENOENT"});await expect(readFile(path.join(ctx.paths.metadataRoot,"plugin-ownership.json"))).rejects.toMatchObject({code:"ENOENT"});
});
it.each(["source/index.tsx","../escaped.ts","C:/escape.ts","index.tsx"])("rejects unsafe or duplicate application target %s",async target=>{
 const id="agent-identity";const {root,installed}=await fixture(id);const file=path.join(installed,"dist/catalog.json");const catalog=JSON.parse(await readFile(file,"utf8"));const templates=catalog.plugins.find((plugin:{id:string})=>plugin.id===id).application.files;templates[1].target=target;await writeFile(file,JSON.stringify(catalog));await expect(ensurePluginApplication(root,id)).rejects.toThrow();const ctx=await resourcePaths(root);await expect(readFile(path.join(ctx.paths.pluginsRoot,id,"application.json"))).rejects.toMatchObject({code:"ENOENT"});
});
it("initializes the cache from the installed plugin manifest",async()=>{
 const id="agent-identity";const {root,installed}=await fixture(id);const catalogFile=path.join(installed,"dist/catalog.json");const catalog=JSON.parse(await readFile(catalogFile,"utf8"));const plugin=catalog.plugins.find((plugin:{id:string})=>plugin.id===id);const file=plugin.takeover.files.find((file:{target:string})=>file.target==="manifest.json");const manifest=JSON.parse(await readFile(path.join(installed,"dist",file.path),"utf8"));manifest.version=plugin.version="0.0.2";manifest.name="Installed manifest";const bytes=JSON.stringify(manifest);await writeFile(path.join(installed,"dist",file.path),bytes);file.sha256=digest(bytes);await writeFile(catalogFile,JSON.stringify(catalog));await ensurePluginApplication(root,id);const ctx=await resourcePaths(root);expect(await readFile(path.join(ctx.paths.pluginsRoot,id,"manifest.json"),"utf8")).toBe(bytes);
});
it("shared auth contracts stay project-owned across application initialization",async()=>{
 const {root}=await fixture("auth-account");const ctx=await resourcePaths(root);const contract=path.join(ctx.paths.sourceRoot,"services/auth/session.ts");await mkdir(path.dirname(contract),{recursive:true});const bytes=Buffer.from('// pre-existing shared auth contract customization\nexport const AUTH_SESSION_SERVICE="auth.session";export const AUTH_GATE_SERVICE="auth.gate";\n');await writeFile(contract,bytes);await ensurePluginApplication(root,"auth-account");await ensurePluginApplication(root,"auth-gate");expect(await readFile(contract)).toEqual(bytes);expect(await readFile(path.join(ctx.paths.pluginsRoot,"auth-account/application.json"),"utf8")).toContain("auth-account");
});

it.each(["assistant", "embedded", "platform"] as const)("new-conversation mode %s initializes application presentation and preserves customization", async mode => {
  const {root} = await fixture("conversation-new");
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({mode,sourceRoot:"src/ui"}));
  const context = { ...await resourcePaths(root), mode };
  await ensurePluginApplication(root, "conversation-new", context);
  const entry = path.join(root, "src/ui/plugins/conversation-new/index.tsx");
  const source = await readFile(entry, "utf8");
  if (mode === "platform") expect(source).not.toContain("showLabel={false}");
  else expect(source).toContain("showLabel={false}");
  await validate(root, {args:["typecheck"]});
  await writeFile(entry, source + "\n// project customization\n");
  expect((await ensurePluginApplication(root, "conversation-new", context)).changed).toBe(false);
  expect(await readFile(entry,"utf8")).toBe(source + "\n// project customization\n");
}, 60000);
