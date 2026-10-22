/** Inspect real package payloads; no publication, source fixture or user-project mutation. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp,readFile,readdir,writeFile,mkdir,rm} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {spawnPnpmSync} from "./pnpm-process.mjs";
import {readNpmArchive} from "../packages/creator/operator/src/updates/npm-artifact.js";
import {loadAgentUISourceRegistry} from "../packages/creator/operator/src/source-catalog/loader.js";
const repo=fileURLToPath(new URL("..",import.meta.url));
const output=process.argv[2]?path.resolve(process.argv[2]):path.join(repo,"docs/verification/published-package-template-audit-2026-10-18");await mkdir(output,{recursive:true});
const temporary=await mkdtemp(path.join(tmpdir(),"agent-ui-package-audit-"));const results:any[]=[];
try{
 for(const id of ["core","renderer","runtime","plugins","creator","web-component"]){
  const destination=path.join(temporary,id);await mkdir(destination);
  const packed=spawnPnpmSync(["pack","--pack-destination",destination],{cwd:path.join(repo,"packages",id),env:{...process.env,npm_config_ignore_scripts:"true"},stdio:"pipe",encoding:"utf8"});
  assert.equal(packed.status,0,`${id}: ${packed.stderr}`);
  const file=(await readdir(destination)).find(file=>file.endsWith(".tgz"))!;const files=readNpmArchive(await readFile(path.join(destination,file)));
  const manifest=JSON.parse(files.get("package/package.json")!.toString());
  const compatibility=JSON.parse(files.get("package/dist/compatibility.json")!.toString());assert.deepEqual(manifest.agentUI,{schemaVersion:1,compatibility});assert(compatibility.releases.some((release:any)=>release.packages.some((pkg:any)=>pkg.name===manifest.name&&pkg.version===manifest.version)));assert.equal(manifest.exports["./compatibility.json"],"./dist/compatibility.json");
  for(const section of ["dependencies","peerDependencies","optionalDependencies"])for(const version of Object.values(manifest[section]??{}))assert(!String(version).startsWith("workspace:"));
  const result:any={name:manifest.name,version:manifest.version,packedFiles:files.size,workspaceDependencyRangesRewritten:true,compatibilityMetadataAndPayloadMatch:true};
  if(id==="plugins"){
   const catalog=JSON.parse(files.get("package/dist/catalog.json")!.toString());let checked=0;
   for(const record of [...catalog.plugins.flatMap((plugin:any)=>[...plugin.files,...(plugin.takeover?.files??[]),...(plugin.takeover?.runtimeFiles??[]),...(plugin.application?.files??[]),...(plugin.application?.sharedFiles??[])]),...catalog.shared]){
    const bytes=files.get("package/dist/"+record.path);assert(bytes,record.path);assert.equal(createHash("sha256").update(bytes!).digest("hex"),record.sha256,record.path);checked++;
   }
   const extracted=path.join(temporary,"unpacked-plugins");for(const [name,bytes]of files){const target=path.join(extracted,...name.slice("package/".length).split("/"));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);}
   const registry=await loadAgentUISourceRegistry(path.join(extracted,"dist/resources/registry"));
   const sourcePaths=[...files.keys()].filter(name=>name.startsWith("package/dist/sources/"));
   result.catalogPlugins=catalog.plugins.length;result.takeoverPlugins=catalog.plugins.filter((plugin:any)=>plugin.takeover).length;result.sourceFiles=sourcePaths.length;result.registryResources=registry.items.length;result.verifiedSourceAndRuntimeRecords=checked;result.sourceSamples=sourcePaths.filter(name=>/plugins\/composer\/(upstream|adapters)\/|takeover\/composer\/adapters\//.test(name)).slice(0,12);result.registryLoadedFromActualTarball=true;
   assert(files.has("package/dist/sources/takeover/composer/adapters/composer.tsx"));
  }
  if(id==="creator"){
   const source=files.get("package/dist/operator/dist/runtime/operator-runtime.mjs")!.toString().replace(/\\u([0-9a-f]{4})/gi,(_,code)=>String.fromCharCode(parseInt(code,16)));assert(source.includes("ensurePluginApplication"));assert(source.includes("takeover_plugin_source"));assert(source.includes("工具已确认以下文件存在用户定制"));
   for(const mode of["platform","assistant","embedded"])assert(files.has(`package/dist/operator/presets/${mode}/app-ui.json`));
   result.officialPresets=["platform","assistant","embedded"];result.applicationTakeoverAndMergeCodeIncluded=true;
  }
  if(id==="creator"){
   const settings=files.get("package/dist/python/agent_ui_creator/model_settings.py")!.toString();assert(settings.includes("max_tokens: int = 8192"));assert(settings.includes("default=8192"));
   assert(files.has("package/dist/ui/CreatorPluginUpdates.js"));assert(files.has("package/dist/updates/update-api.js"));
   const prompt=files.get("package/dist/python/agent_ui_creator/domain_agent/prompt.py")!.toString();assert(prompt.includes("OFFICIAL_PLUGIN_OWNERSHIP_RULES"));
   result.defaultModelOutputTokens=8192;result.updateUIAndAPIsIncluded=true;result.propsFirstAndTakeoverPolicyIncluded=true;
  }
  results.push(result);
 }
 await writeFile(path.join(output,"packed-payloads.json"),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await rm(temporary,{recursive:true,force:true});}
