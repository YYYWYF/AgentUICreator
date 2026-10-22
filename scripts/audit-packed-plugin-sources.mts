/** Inspect real package payloads; no publication, source fixture or user-project mutation. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp,readFile,readdir,writeFile,mkdir,rm} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {spawnPnpmSync} from "./pnpm-process.mjs";
import {readNpmArchive} from "../packages/operator/control/src/updates/npm-artifact.js";
import {loadAgentUISourceRegistry} from "../packages/operator/control/src/source-catalog/loader.js";
import {sidecarRoot,verifySidecarPackage} from "../packages/creator/scripts/verify-sidecar-package.mjs";
import {readCreatorPythonArtifact} from "./creator-sidecar-audit.mjs";
import {auditCreatorNodeEntry,auditOperatorNodeArtifact} from "./creator-node-artifact-audit.mjs";
import {publicModules} from "./build-public-packages.mjs";
const repo=fileURLToPath(new URL("..",import.meta.url));
const output=process.argv[2]?path.resolve(process.argv[2]):path.join(repo,"docs/verification/published-package-template-audit-2026-10-18");await mkdir(output,{recursive:true});
const temporary=await mkdtemp(path.join(tmpdir(),"agent-ui-package-audit-"));const results:any[]=[];
try{
 for(const id of publicModules){
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
  if(id==="operator")Object.assign(result,auditOperatorNodeArtifact(files));
  if(id==="creator"){
   Object.assign(result,auditCreatorNodeEntry(files,manifest));
   const platformRoot=sidecarRoot(`${process.platform}-${process.arch}`);await verifySidecarPackage(platformRoot);
   const platformDestination=path.join(temporary,"creator-platform");await mkdir(platformDestination);
   const platformPacked=spawnPnpmSync(["pack","--pack-destination",platformDestination],{cwd:platformRoot,env:{...process.env,npm_config_ignore_scripts:"true"},stdio:"pipe",encoding:"utf8"});assert.equal(platformPacked.status,0,platformPacked.stderr);
   const platformFile=(await readdir(platformDestination)).find(file=>file.endsWith(".tgz"))!;
   const python=readCreatorPythonArtifact(files,manifest,path.join(platformDestination,platformFile));
   const settings=python.settings;assert(settings.includes("max_tokens: int = 8192"));assert(settings.includes("default=8192"));
   const prompt=python.prompt;assert(prompt.includes("application props/children/composition"));assert(prompt.includes("explicit takeover consent"));
   result.pythonSidecar={name:python.name,version:python.version,sourceHash:python.sourceHash};result.defaultModelOutputTokens=8192;result.propsFirstAndTakeoverPolicyIncluded=true;
  }
  results.push(result);
 }
 await writeFile(path.join(output,"packed-payloads.json"),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await rm(temporary,{recursive:true,force:true});}
