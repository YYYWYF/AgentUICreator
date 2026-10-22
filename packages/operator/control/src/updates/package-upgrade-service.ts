import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { satisfies, validRange } from "semver";
import { PackageUpdateService } from "./package-update-service.js";
import { readPackageIdentity } from "./package-identity.js";
import type { CompatibilityReleaseProvider } from "./release-provider.js";
import { runUpdateCommand, verifyNpmArtifact, verifyInstalledArtifact, type UpdateCommand, type VerifiedArtifact } from "./npm-artifact.js";
import { detectResourcePackageManager } from "../project/ensure-resource-packages.js";
import { resourcePaths } from "../project/optional-resource-paths.js";
import { acquireOperatorLock } from "../project/operator-lock.js";
import { readPluginSourceOwnership } from "../project/plugin-source-ownership.js";

const journalName=".agent-ui-npm-update.json";
const hash=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
const optional=async(file:string)=>readFile(file,"utf8").catch(error=>{if(error.code==="ENOENT")return null;throw error;});
export interface PackageUpgradePlan {
  id:string; releaseId:string; digest:string; manager:"npm"|"pnpm"; lockfile:string;
  packages:{name:string;current:string;target:string;integrity:string;field:string|null}[];
  checks:string[]; expiresAt:string;
}
export interface PackageUpgradeResult { status:"installed"|"restored"|"recovery-required"; checks:string[]; failure?:string; recoveryId?:string }
interface Journal { schemaVersion:1; id:string; root:string; manager:"npm"|"pnpm"; lockfile:string; before:string; lockBefore:string; after:string; protectedHash:string; previous:{name:string;version:string}[]; state:"installing"|"recovering"|"recovery-required"; lockAfter?:string|null }
interface Stored { root:string;plan:PackageUpgradePlan;before:string;lockBefore:string;after:string;protectedHash:string;identities:string;artifacts:VerifiedArtifact[] }
const active=new Set<string>();
const fields=["dependencies","devDependencies","optionalDependencies","peerDependencies"];
async function protectedHash(root:string){
  const digest=createHash("sha256");let count=0;
  const projectConfig=await optional(path.join(root,".agent-ui/project.json"));
  const sourceTop=projectConfig ? String(JSON.parse(projectConfig).sourceRoot??"").replaceAll("\\","/").split("/")[0] : undefined;
  async function walk(directory:string,relative=""):Promise<void>{
    for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const logical=relative?`${relative}/${entry.name}`:entry.name;
      if(logical===".agent-ui/creator/control/operator.lock")continue;
      if(entry.name==="node_modules"||entry.name===".git"||(!relative&&[journalName,journalName+".tmp","package.json","package-lock.json","pnpm-lock.yaml"].includes(entry.name) || (!relative&&entry.name!==sourceTop&&["dist","build","coverage"].includes(entry.name))))continue;
      if(++count>50000)throw new Error("PACKAGE_PROJECT_TOO_LARGE");
      const file=path.join(directory,entry.name);
      if(entry.isSymbolicLink())throw new Error("PACKAGE_PROTECTED_SYMLINK");
      if(entry.isDirectory())await walk(file,logical);else digest.update(logical+"\0").update(await readFile(file));
    }
  }await walk(root);return digest.digest("hex");
}
async function standalone(root:string){
  for(let directory=root;;directory=path.dirname(directory)){
    const raw=await optional(path.join(directory,"package.json"));
    if((raw&&JSON.parse(raw).workspaces)||await optional(path.join(directory,"pnpm-workspace.yaml")))throw new Error("PACKAGE_WORKSPACE_REQUIRES_SEPARATE_PLAN");
    if(directory===path.dirname(directory))break;
  }
  const pkg=JSON.parse((await optional(path.join(root,"package.json")))!);
  if(pkg.overrides||pkg.resolutions||pkg.pnpm?.overrides||pkg.pnpm?.patchedDependencies)throw new Error("PACKAGE_OVERRIDE_REQUIRES_SEPARATE_PLAN");
  for(const file of ["package.json","package-lock.json","pnpm-lock.yaml",journalName])if(await lstat(path.join(root,file)).then(s=>s.isSymbolicLink(),e=>{if(e.code==="ENOENT")return false;throw e;}))throw new Error("PACKAGE_PROTECTED_SYMLINK");
}
async function installedState(root:string,names:string[]){return JSON.stringify(await Promise.all(names.map(async name=>{const item=await readPackageIdentity(root,name);return [name,item?.version,item?.root];})));}
async function checkPluginApis(root:string,artifact:VerifiedArtifact){
  if(!artifact.name.endsWith("-plugins"))return;
  const {paths}=await resourcePaths(root);
  const ownership=await readPluginSourceOwnership(paths.metadataRoot);
  const catalog=JSON.parse(artifact.files.get("package/dist/catalog.json")?.toString()??"null");
  if(!catalog||catalog.package?.version!==artifact.version||catalog.package?.name!==artifact.name)throw new Error("PACKAGE_CATALOG_IDENTITY");
  const installed=await readPackageIdentity(root,artifact.name);
  const previous=installed?JSON.parse(await readFile(path.join(installed.root,"dist/catalog.json"),"utf8")):null;
  // npm must never require an implicit application migration, including npm-default wrappers.
  for(const entry of await readdir(paths.pluginsRoot,{withFileTypes:true}).catch(error=>{if(error.code==="ENOENT")return [];throw error;})){
    if(!entry.isDirectory()||!await optional(path.join(paths.pluginsRoot,entry.name,"application.json")))continue;
    const old=previous?.plugins.find((p:{id:string})=>p.id===entry.name),next=catalog.plugins.find((p:{id:string})=>p.id===entry.name);
    const contract=(p:any)=>[p?.application?.component??null,p?.application?.scopeKind??null,p?.application?.registration??null,p?.application?.runtimeContext===true,p?.application?.hostApplication===true,p?.application?.services??null,p?.application?.hostBindings??[],p?.application?.railAction??null];
    if(!old||!next||JSON.stringify(contract(old))!==JSON.stringify(contract(next)))throw new Error("PACKAGE_APPLICATION_MIGRATION_REQUIRED");
  }
  for(const owner of Object.values(ownership.plugins))for(const [api,version] of Object.entries(owner.compatibility))if(catalog.sharedApis?.[api]!==version)throw new Error("PACKAGE_SHARED_API_MIGRATION_REQUIRED");
}
/** Project package installation is a separate transaction from implementation-source merging. */
export class PackageUpgradeService {
  private plans=new Map<string,Stored>();
  constructor(private provider:CompatibilityReleaseProvider,private overview:PackageUpdateService,private run:UpdateCommand=runUpdateCommand){}
  async recovery(root:string):Promise<{id:string;state:string}|null>{
    const raw=await optional(path.join(root,journalName));if(!raw)return null;
    const journal=JSON.parse(raw);return {id:journal.id,state:journal.state};
  }
  async plan(projectRoot:string):Promise<PackageUpgradePlan>{
    const root=await realpath(projectRoot);await standalone(root);
    if(await this.recovery(root))throw new Error("PACKAGE_RECOVERY_REQUIRED");
    if(await optional(path.join(root,".agent-ui","creator","control","operator.lock")))throw new Error("PACKAGE_OPERATION_ACTIVE");
    if(await optional(path.join(root,".agent-ui/project.json"))){
      const {paths}=await resourcePaths(root);
      for(const file of ["source-project-transaction.json","source-transaction.json"])if(await optional(path.join(paths.metadataRoot,file)))throw new Error("PACKAGE_SOURCE_RECOVERY_REQUIRED");
    }
    const before=await readFile(path.join(root,"package.json"),"utf8"),protectedBefore=await protectedHash(root);
    const current=await this.overview.inspect(root,true),discovery=await this.provider.check(false, root);
    if(current.status!=="online"||discovery.status!=="online"||!current.digest||current.digest!==discovery.digest)throw new Error("PACKAGE_ONLINE_METADATA_REQUIRED");
    const release=discovery.manifest?.releases.find(r=>r.id===current.recommendedReleaseId);
    if(!release)throw new Error("PACKAGE_COMPATIBILITY_BLOCKED");
    const relevant=current.packages.filter(pkg=>pkg.scope==="project");
    if(!relevant.some(pkg=>pkg.updateAvailable))throw new Error("PACKAGE_NO_UPDATE");
    const manager=await detectResourcePackageManager(root);
    if(manager!=="npm"&&manager!=="pnpm")throw new Error("PACKAGE_MANAGER_UNSUPPORTED");
    const lockfile=manager==="npm"?"package-lock.json":"pnpm-lock.yaml",lockBefore=await optional(path.join(root,lockfile));
    if(!lockBefore)throw new Error("PACKAGE_EXISTING_LOCK_REQUIRED");
    if(await optional(path.join(root,manager==="npm"?"pnpm-lock.yaml":"package-lock.json"))||await optional(path.join(root,"yarn.lock"))||await optional(path.join(root,"bun.lock")))throw new Error("PACKAGE_MULTIPLE_LOCKS");
    const identities=await installedState(root,relevant.map(p=>p.name));const manifest=JSON.parse(before),artifacts:VerifiedArtifact[]=[],packages:PackageUpgradePlan["packages"]=[];
    for(const item of relevant){
      const target=release.packages.find(p=>p.name===item.name)!;
      const declared=fields.filter(field=>manifest[field]?.[item.name]!==undefined);
      if(declared.length>1)throw new Error("PACKAGE_DUPLICATE_DECLARATION");
      const field=declared[0]??null;
      if(field&&!validRange(manifest[field][item.name]))throw new Error("PACKAGE_LINKED_DECLARATION");
      const identity=await readPackageIdentity(root,item.name);
      if(!identity||!path.relative(path.join(root,"node_modules"),identity.root)||path.relative(path.join(root,"node_modules"),identity.root).startsWith(".."))throw new Error("PACKAGE_LINKED_INSTALLATION");
      const artifact=await verifyNpmArtifact(root,target,release,this.run);artifacts.push(artifact);await checkPluginApis(root,artifact);
      if(artifact.manifest.engines?.node&&!satisfies(process.versions.node,artifact.manifest.engines.node))throw new Error("PACKAGE_NODE_INCOMPATIBLE");
      for(const [name,range] of Object.entries(artifact.manifest.peerDependencies??{}) as [string,string][]){
        if(release.packages.some(p=>p.name===name))continue;
        const peer=await readPackageIdentity(root,name);
        if((peer&&!satisfies(peer.version,range))||(!peer&&!artifact.manifest.peerDependenciesMeta?.[name]?.optional))throw new Error("PACKAGE_PEER_MIGRATION_REQUIRED");
      }
      for(const [name,range] of Object.entries(artifact.manifest.dependencies??{}) as [string,string][]){
        if(release.packages.some(p=>p.name===name))continue;
        const dependency=await readPackageIdentity(identity.root,name);
        if(!dependency||!satisfies(dependency.version,range))throw new Error("PACKAGE_DEPENDENCY_MIGRATION_REQUIRED");
      }
      packages.push({name:item.name,current:identity.version,target:target.version,integrity:artifact.integrity,field});
      if(field && item.updateAvailable)manifest[field][item.name]=target.version;
    }
    const checks=["typecheck","build"].filter(name=>typeof manifest.scripts?.[name]==="string");
    const plan:PackageUpgradePlan={id:randomUUID(),releaseId:release.id,digest:current.digest,manager,lockfile,packages,checks,expiresAt:new Date(Date.now()+15*60_000).toISOString()};
    if(before!==await readFile(path.join(root,"package.json"),"utf8")||lockBefore!==await optional(path.join(root,lockfile))||protectedBefore!==await protectedHash(root))throw new Error("PACKAGE_PLAN_STALE");
    const newline=before.includes("\r\n")?"\r\n":"\n",indent=before.match(/\n([ \t]+)"/)?.[1]??"  ";
    const after=(JSON.stringify(manifest,null,indent)+"\n").replace(/\n/g,newline);
    for(const [id,stored] of this.plans)if(stored.root===root||Date.parse(stored.plan.expiresAt)<Date.now())this.plans.delete(id);
    while(this.plans.size>=8)this.plans.delete(this.plans.keys().next().value!);
    this.plans.set(plan.id,{root,plan,before,lockBefore,after,protectedHash:protectedBefore,identities,artifacts});return plan;
  }
  async execute(projectRoot:string,id:string):Promise<PackageUpgradeResult>{
    const root=await realpath(projectRoot),stored=this.plans.get(id);
    if(!stored||stored.root!==root||Date.parse(stored.plan.expiresAt)<Date.now())throw new Error("PACKAGE_PLAN_STALE");
    if(active.has(root))throw new Error("PACKAGE_OPERATION_ACTIVE");active.add(root);
    let unlock:(()=>Promise<void>)|undefined;
    try{
      unlock=await acquireOperatorLock(root);
      await standalone(root);
      if(await this.recovery(root))throw new Error("PACKAGE_RECOVERY_REQUIRED");
      const discovery=await this.provider.check(true, root);
      if(discovery.status!=="online"||discovery.digest!==stored.plan.digest||stored.before!==await readFile(path.join(root,"package.json"),"utf8")||stored.lockBefore!==await optional(path.join(root,stored.plan.lockfile))||stored.protectedHash!==await protectedHash(root)||stored.identities!==await installedState(root,stored.plan.packages.map(p=>p.name)))throw new Error("PACKAGE_PLAN_STALE");
      const journal:Journal={schemaVersion:1,id,root,manager:stored.plan.manager,lockfile:stored.plan.lockfile,before:stored.before,lockBefore:stored.lockBefore,after:stored.after,protectedHash:stored.protectedHash,previous:stored.plan.packages.map(p=>({name:p.name,version:p.current})),state:"installing"};
      await writeFile(path.join(root,journalName),JSON.stringify(journal),{flag:"wx",mode:0o600});this.plans.delete(id);
      try{
        await writeFile(path.join(root,"package.json"),stored.after);
        await this.run(root,stored.plan.manager,["install","--ignore-scripts",...(stored.plan.manager==="pnpm"?["--no-frozen-lockfile"]:[])]);
        await this.verify(root,stored.plan.packages.map(p=>({name:p.name,version:p.target})));
        const resolved=await this.overview.inspect(root);
        if(resolved.recommendedReleaseId!==stored.plan.releaseId||resolved.packages.some(pkg=>pkg.scope==="project"&&!stored.plan.packages.some(expected=>expected.name===pkg.name&&expected.target===pkg.currentVersion)))throw new Error("PACKAGE_INSTALLED_COMBINATION");
        const lock=await readFile(path.join(root,stored.plan.lockfile),"utf8");
        for(const artifact of stored.artifacts){
          if(stored.plan.manager==="npm"){
            const entry=JSON.parse(lock).packages?.[`node_modules/${artifact.name}`];
            if(entry?.version!==artifact.version||entry?.integrity!==artifact.integrity)throw new Error("PACKAGE_INSTALLED_INTEGRITY");
          }else if(!lock.includes(artifact.integrity))throw new Error("PACKAGE_INSTALLED_INTEGRITY");
          await verifyInstalledArtifact((await readPackageIdentity(root,artifact.name))!.root,artifact);
        }
        if(await readFile(path.join(root,"package.json"),"utf8")!==stored.after)throw new Error("PACKAGE_MANIFEST_CHANGED");
        for(const check of stored.plan.checks)await this.run(root,stored.plan.manager,["run",check]);
        if(await protectedHash(root)!==stored.protectedHash)throw new Error("PACKAGE_PROTECTED_FILES_CHANGED");
        await rm(path.join(root,journalName));return {status:"installed",checks:stored.plan.checks};
      }catch(error){
        journal.lockAfter=await optional(path.join(root,journal.lockfile));journal.state="recovery-required";await this.save(root,journal);
        const restored=await this.restore(root,journal);
        return {...restored, failure:error instanceof Error && /^PACKAGE_[A-Z_]+$/.test(error.message)?error.message:"PACKAGE_VALIDATION_FAILED"};
      }
    }finally{try{await unlock?.();}finally{active.delete(root);}}
  }
  async recover(projectRoot:string,id:string):Promise<PackageUpgradeResult>{
    const root=await realpath(projectRoot);if(active.has(root))throw new Error("PACKAGE_OPERATION_ACTIVE");active.add(root);
    let unlock:(()=>Promise<void>)|undefined;
    try{
      unlock=await acquireOperatorLock(root);await standalone(root);const journal=JSON.parse((await optional(path.join(root,journalName)))??"null") as Journal;
      if(!journal||journal.schemaVersion!==1||journal.root!==root||journal.id!==id||!["npm","pnpm"].includes(journal.manager)||journal.lockfile!==(journal.manager==="npm"?"package-lock.json":"pnpm-lock.yaml"))throw new Error("PACKAGE_RECOVERY_INVALID");
      if(journal.state==="installing"||journal.state==="recovering") return {status:"recovery-required",recoveryId:journal.id,checks:[],failure:"PACKAGE_INTERRUPTED_INSTALL_REQUIRES_REVIEW"};
      return await this.restore(root,journal);
    }finally{try{await unlock?.();}finally{active.delete(root);}}
  }
  private async save(root:string,journal:Journal){await writeFile(path.join(root,journalName+".tmp"),JSON.stringify(journal),{mode:0o600});await rename(path.join(root,journalName+".tmp"),path.join(root,journalName));}
  private async verify(root:string,packages:{name:string;version:string}[]){for(const pkg of packages)if((await readPackageIdentity(root,pkg.name))?.version!==pkg.version)throw new Error("PACKAGE_INSTALLED_VERSION");}
  private async restore(root:string,journal:Journal):Promise<PackageUpgradeResult>{
    try{
      const manifest=await optional(path.join(root,"package.json")),lock=await optional(path.join(root,journal.lockfile));
      if((manifest!==journal.before&&manifest!==journal.after)||await protectedHash(root)!==journal.protectedHash||((journal.lockAfter===undefined&&lock!==journal.lockBefore)||(journal.lockAfter!==undefined&&lock!==journal.lockAfter&&lock!==journal.lockBefore)))throw new Error("PACKAGE_RECOVERY_CONCURRENT_EDIT");
      journal.state="recovering";await this.save(root,journal);
      await writeFile(path.join(root,"package.json"),journal.before);await writeFile(path.join(root,journal.lockfile),journal.lockBefore);
      await this.run(root,journal.manager,journal.manager==="npm"?["ci","--ignore-scripts"]:["install","--frozen-lockfile","--ignore-scripts"]);
      await this.verify(root,journal.previous);
      if(await protectedHash(root)!==journal.protectedHash||await optional(path.join(root,"package.json"))!==journal.before||await optional(path.join(root,journal.lockfile))!==journal.lockBefore)throw new Error("PACKAGE_RECOVERY_VERIFICATION");
      await rm(path.join(root,journalName));return {status:"restored",checks:[]};
    }catch{journal.state="recovery-required";await this.save(root,journal);return {status:"recovery-required",recoveryId:journal.id,checks:[]};}
  }
}
