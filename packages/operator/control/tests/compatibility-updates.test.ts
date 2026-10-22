// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, rename, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { officialPackageNames, parseCompatibilityManifest } from "../src/updates/compatibility-release";
import { HttpCompatibilityReleaseProvider } from "../src/updates/release-provider";
import { PackageUpdateService } from "../src/updates/package-update-service";
import { AgentUIUpdateService } from "../src/project/source-registry/updates";
import type { ResolvedSourceRelease } from "../src/source-catalog/release";
import { build } from "esbuild";
import { repositoryRoot } from "./support/generated-project";
const roots:string[]=[];const servers:Server[]=[];
afterEach(async()=>{for(const server of servers.splice(0)){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
const name=(id:string)=>`@za38.03/agent-ui-${id}`;
function release(version="1.0.8",minimumCreatorVersion?:string){return {id:`official-${version}`,publishedAt:`2026-10-${version.endsWith("9")?"19":"18"}T00:00:00Z`,channel:"stable" as const,...(minimumCreatorVersion?{minimumCreatorVersion}:{}),packages:officialPackageNames.map(pkg=>({name:pkg,version,requires:{},historyFrom:"1.0.0",changes:pkg===name("plugins")?[{id:"counter",version:"1.0.1",kind:"feature" as const,summary:"Counter",pluginId:"composer"},{id:"counter",version:"1.0.8",kind:"feature" as const,summary:"Counter",pluginId:"composer"},{id:"migration",version:"1.0.4",kind:"breaking" as const,summary:"Migration required"}]:[]}))};}
async function feed(){let body=JSON.stringify({schemaVersion:1,releases:[release()]});let status=200;let hits=0;const server=createServer((_req,res)=>{hits++;res.writeHead(status,{"Content-Type":"application/json"});res.end(body);});servers.push(server);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address() as {port:number};return {url:`http://127.0.0.1:${address.port}/compatibility.json`,set(value:unknown,code=200){body=typeof value==="string"?value:JSON.stringify(value);status=code;},hits:()=>hits};}
async function project(){const root=await mkdtemp(path.join(tmpdir(),"兼容更新 空格-"));roots.push(root);const tools=path.join(root,"tools");await mkdir(tools);await writeFile(path.join(root,"package.json"),JSON.stringify({dependencies:{[name("plugins")]:"^1.0.0",react:"19.1.1"}}));await writeFile(path.join(tools,"package.json"),JSON.stringify({name:name("creator"),version:"1.0.0"}));
 const install=async(base:string,pkg:string,version:string,dependencies={})=>{const target=path.join(base,"node_modules",...pkg.split("/"));await mkdir(target,{recursive:true});await writeFile(path.join(target,"package.json"),JSON.stringify({name:pkg,version,dependencies}));};
 await install(root,name("plugins"),"1.0.0",{[name("core")]:"1.0.0"});await install(root,name("core"),"1.0.0");await install(root,"react","19.1.1");
 for(const [file,content] of [["plugins/composer/index.tsx","// custom app props\r\n"],["plugins/composer/source/adapters/composer.tsx","// local implementation\n"],[".agent-ui/plugin-ownership.json",'{"base":"preserved"}'],["pnpm-lock.yaml","lockfileVersion: '6.0'\n"]]){await mkdir(path.dirname(path.join(root,file!)),{recursive:true});await writeFile(path.join(root,file!),content!);}
 return {root,tools};}
async function snapshot(root:string){const digest=createHash("sha256");async function walk(dir:string){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else digest.update(file).update(await readFile(file));}}await walk(root);return digest.digest("hex");}
it("validates exact versions, package names, immutable identities, stable channels and dependency combinations",()=>{
 const base={schemaVersion:1,releases:[release()]};expect(parseCompatibilityManifest(base).releases).toHaveLength(1);
 expect(()=>parseCompatibilityManifest({...base,releases:[release(),release()]})).toThrow("DUPLICATE_RELEASE");
 for(const value of ["latest","^1.0.8","1.0.8-beta.1"]){const r=release();r.packages[0]!.version=value;expect(()=>parseCompatibilityManifest({schemaVersion:1,releases:[r]})).toThrow();}
 const r=release();r.packages[0]!.requires={[name("plugins")]:">=2.0.0"};expect(()=>parseCompatibilityManifest({schemaVersion:1,releases:[r]})).toThrow("INCOMPATIBLE_COMBINATION");
 expect(()=>parseCompatibilityManifest({schemaVersion:1,releases:[{...release(),command:"npm install"}]})).toThrow();
});
it("uses real bounded HTTP, coalesces checks and keeps stale results explicitly cached after failure",async()=>{
 const f=await feed();const provider=new HttpCompatibilityReleaseProvider(f.url);
 const [a,b]=await Promise.all([provider.check(),provider.check()]);expect(f.hits()).toBe(1);expect(a).toEqual(b);expect(a.status).toBe("online");
 f.set("offline",503);const stale=await provider.check(true);expect(stale.status).toBe("cached");expect(stale.fetchedAt).toBe(a.fetchedAt);expect((await provider.check()).status).toBe("cached");
 f.set({schemaVersion:1,releases:[{...release(),node:">=100"}]});expect((await provider.check(true)).status).toBe("cached");
 f.set({schemaVersion:1,releases:[release()]});expect((await provider.check(true)).status).toBe("online");
});
it("does not report fresh success for unconfigured, malformed, oversized, redirect or unreachable feeds",async()=>{
 expect((await new HttpCompatibilityReleaseProvider().check()).status).toBe("unconfigured");
 expect((await new HttpCompatibilityReleaseProvider("http://example.com/feed").check()).status).toBe("unavailable");
 const f=await feed();for(const body of ['{broken',"x".repeat(2_000_001)]){f.set(body);expect((await new HttpCompatibilityReleaseProvider(f.url).check()).status).toBe("unavailable");}
 f.set("redirect",302);expect((await new HttpCompatibilityReleaseProvider(f.url).check()).status).toBe("unavailable");
});
it("bounds a stalled HTTP request and reports a missing resolved package without fallback",async()=>{
 const server=createServer(()=>undefined);servers.push(server);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/stalled`;
 expect((await new HttpCompatibilityReleaseProvider(url,{timeoutMs:30}).check()).status).toBe("unavailable");
 const f=await feed();const {root,tools}=await project();await rm(path.join(root,"node_modules/@za38.03/agent-ui-core"),{recursive:true});const result=await new PackageUpdateService(new HttpCompatibilityReleaseProvider(f.url),{root:tools}).inspect(root);expect(result.recommendedReleaseId).toBeUndefined();expect(result.blockedReleases[0]!.issues.some(issue=>issue.name===name("core")&&issue.code==="missing")).toBe(true);
});
it("selects newest compatible stable combination, shows cumulative notes and does not mutate customization or source BASE",async()=>{
 const f=await feed();f.set({schemaVersion:1,releases:[release("1.0.9","2.0.0"),release()]});const {root,tools}=await project();const before=await snapshot(root);
 const result=await new PackageUpdateService(new HttpCompatibilityReleaseProvider(f.url),{root:tools}).inspect(root);
 expect(result.status).toBe("online");expect(result.recommendedReleaseId).toBe("official-1.0.8");expect(result.latestReleaseId).toBe("official-1.0.9");expect(result.blockedReleases[0]!.issues[0]!.code).toBe("creator");
 expect(result.packages.map(pkg=>pkg.name)).not.toContain(name("web-component"));expect(result.packages.map(pkg=>pkg.name)).toContain(name("core"));
 const plugins=result.packages.find(pkg=>pkg.name===name("plugins"))!;expect(plugins.summary.find(change=>change.id==="counter")!.versions).toEqual(["1.0.8","1.0.1"]);expect(plugins.history).toHaveLength(3);expect(plugins.summary.some(change=>change.kind==="breaking")).toBe(true);expect(plugins.historyIncomplete).toBe(false);expect(result.installationSupported).toBe(false);
 expect(await snapshot(root)).toBe(before);
});
it("collects intermediate release notes and flags missing history instead of asserting no changes",async()=>{
 const f=await feed();const target=release();target.packages.forEach(pkg=>{pkg.changes=[];delete (pkg as {historyFrom?:string}).historyFrom;});const earlier=release("1.0.1");earlier.publishedAt="2026-10-17T00:00:00Z";earlier.packages.forEach(pkg=>{pkg.changes=pkg.changes.filter(c=>c.version==="1.0.1");});f.set({schemaVersion:1,releases:[target,earlier]});const {root,tools}=await project();const result=await new PackageUpdateService(new HttpCompatibilityReleaseProvider(f.url),{root:tools}).inspect(root);const plugins=result.packages.find(pkg=>pkg.name===name("plugins"))!;expect(plugins.history).toHaveLength(1);expect(plugins.historyIncomplete).toBe(true);
});
it("fails compatibility closed for missing Node/React/tools, mismatched declarations and downgrade",async()=>{
 const f=await feed();const r=release();Object.assign(r,{node:">=99",react:">=99",minimumOperatorVersion:"99.0.0"});f.set({schemaVersion:1,releases:[r]});const {root,tools}=await project();const result=await new PackageUpdateService(new HttpCompatibilityReleaseProvider(f.url),{root:tools}).inspect(root);expect(result.recommendedReleaseId).toBeUndefined();expect(result.blockedReleases[0]!.issues.map(i=>i.code)).toEqual(expect.arrayContaining(["node","react","operator"]));
});
it("unknown Creator version cannot satisfy a minimum version in legacy source updates",()=>{
 const candidate={descriptor:{contractVersion:1,minimumCreatorVersion:"0.0.2"}} as ResolvedSourceRelease;
 const compatible=(service:AgentUIUpdateService)=>(service as unknown as {compatibility(release:ResolvedSourceRelease):string}).compatibility(candidate);
 expect(compatible(new AgentUIUpdateService())).toBe("creator-upgrade-required");expect(compatible(new AgentUIUpdateService(undefined,"0.0.1"))).toBe("creator-upgrade-required");expect(compatible(new AgentUIUpdateService(undefined,"0.0.2"))).toBe("compatible");
});
it("builds official npm dependency versions from package identity, separate from internal plugin versions",async()=>{
 const entry=path.join(repositoryRoot,"packages/plugins/src/catalog/package-plugins.ts");const pkg=path.join(repositoryRoot,"packages/plugins/package.json");const metadata=JSON.parse(await readFile(pkg,"utf8"));
 const result=await build({entryPoints:[entry],bundle:true,write:false,format:"esm",platform:"node",plugins:[{name:"candidate-version",setup(build){build.onLoad({filter:/package\.json$/},async args=>args.path===pkg?{contents:JSON.stringify({...metadata,version:"1.2.3"}),loader:"json"}:undefined);}}]});
 const imported=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles![0]!.text).toString("base64")}`);expect(imported.officialPackagePlugin("composer").runtime.version).toBe("1.2.3");expect(imported.officialPackagePlugin("composer").manifest.version).toBe("0.0.1");
});

it("blocks conflicting resolved dependency versions and does not downgrade newer local installs",async()=>{
 const f=await feed();const {root,tools}=await project();
 const manifest=JSON.parse(await readFile(path.join(root,"package.json"),"utf8"));manifest.dependencies[name("core")]="2.0.0";await writeFile(path.join(root,"package.json"),JSON.stringify(manifest));
 await writeFile(path.join(root,"node_modules/@za38.03/agent-ui-core/package.json"),JSON.stringify({name:name("core"),version:"2.0.0"}));
 const nested=path.join(root,"node_modules/@za38.03/agent-ui-plugins/node_modules/@za38.03/agent-ui-core");await mkdir(nested,{recursive:true});await writeFile(path.join(nested,"package.json"),JSON.stringify({name:name("core"),version:"1.0.0"}));
 const result=await new PackageUpdateService(new HttpCompatibilityReleaseProvider(f.url),{root:tools}).inspect(root);expect(result.recommendedReleaseId).toBeUndefined();expect(result.blockedReleases[0]!.issues.some(issue=>issue.code==="multiple")).toBe(true);
});

it("resolves actual pnpm-style peer envelopes through symlinks without assuming hoisted dependencies",async()=>{
 const f=await feed();const {root,tools}=await project();const scope=path.join(root,".store/plugins/node_modules/@za38.03");await mkdir(scope,{recursive:true});
 const exposed=path.join(root,"node_modules/@za38.03/agent-ui-plugins");await rename(exposed,path.join(scope,"agent-ui-plugins"));await rename(path.join(root,"node_modules/@za38.03/agent-ui-core"),path.join(scope,"agent-ui-core"));await symlink(path.join(scope,"agent-ui-plugins"),exposed,process.platform==="win32"?"junction":"dir");
 const result=await new PackageUpdateService(new HttpCompatibilityReleaseProvider(f.url),{root:tools}).inspect(root);expect(result.recommendedReleaseId).toBe("official-1.0.8");expect(result.packages.find(pkg=>pkg.name===name("core"))!.currentVersion).toBe("1.0.0");
});
it("keeps tool-owned project dependencies in the separate tool installation",()=>{
 const candidate=release("1.0.8");candidate.packages.find(p=>p.name===name("creator"))!.requires={[name("plugins")]:"1.0.0"};
 expect(parseCompatibilityManifest({schemaVersion:1,releases:[candidate]}).releases).toHaveLength(1);
 candidate.packages.find(p=>p.name===name("runtime"))!.requires={[name("plugins")]:"1.0.0"};
 expect(()=>parseCompatibilityManifest({schemaVersion:1,releases:[candidate]})).toThrow("UPDATE_MANIFEST_INCOMPATIBLE_COMBINATION");
});
it("rejects a production package depending on development tools",()=>{
 const candidate=release("1.0.8");candidate.packages.find(p=>p.name===name("plugins"))!.requires={[name("creator")]:"1.0.8"};
 expect(()=>parseCompatibilityManifest({schemaVersion:1,releases:[candidate]})).toThrow("UPDATE_MANIFEST_PRODUCTION_TOOL_DEPENDENCY");
});

it("keeps Creator and Operator independently versioned and validates their exact dependency", () => {
 expect(officialPackageNames).toHaveLength(7);
 expect(officialPackageNames.filter(pkg => pkg.endsWith("-creator"))).toHaveLength(1);
 expect(officialPackageNames).toContain(name("operator"));
 const candidate = release();
 candidate.packages.find(pkg => pkg.name === name("operator"))!.version = "1.1.0";
 const creator = candidate.packages.find(pkg => pkg.name === name("creator"))!;
 creator.requires = { [name("operator")]: "1.1.0" };
 expect(parseCompatibilityManifest({ schemaVersion: 1, releases: [candidate] }).releases).toHaveLength(1);
 creator.requires = { [name("operator")]: "2.0.0" };
 expect(() => parseCompatibilityManifest({ schemaVersion: 1, releases: [candidate] })).toThrow("UPDATE_MANIFEST_INCOMPATIBLE_COMBINATION");
});
