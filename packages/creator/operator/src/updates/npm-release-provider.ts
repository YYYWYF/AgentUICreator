import {createHash} from "node:crypto";
import path from "node:path";
import {valid} from "semver";
import {officialPackageNames,parseCompatibilityManifest,type CompatibilityRelease} from "./compatibility-release.js";
import {runUpdateCommand,type UpdateCommand} from "./npm-artifact.js";
import type {CompatibilityReleaseProvider,ReleaseDiscovery} from "./release-provider.js";

/** npm supplies both version identities and the publisher's packaged compatibility history.
 * npm itself resolves the project registry, scoped registries and credentials. No second API.
 */
export class NpmCompatibilityReleaseProvider implements CompatibilityReleaseProvider {
 private cache=new Map<string,ReleaseDiscovery>();
 private pending=new Map<string,Promise<ReleaseDiscovery>>();
 private identities=new Map<string,Map<string,string>>();
 constructor(private readonly options:{run?:UpdateCommand;now?:()=>number;ttlMs?:number}={}){}
 check(refresh=false,projectRoot=process.cwd()):Promise<ReleaseDiscovery>{
  const root=path.resolve(projectRoot),now=(this.options.now??Date.now)();
  const pending=this.pending.get(root);if(pending)return pending;
  const previous=this.cache.get(root);
  if(!refresh&&previous?.status==="online"&&previous.fetchedAt&&now-Date.parse(previous.fetchedAt)<(this.options.ttlMs??60_000))return Promise.resolve({...previous,checkedAt:new Date(now).toISOString()});
  const request=this.read(root,now).finally(()=>this.pending.delete(root));this.pending.set(root,request);return request;
 }
 private async read(root:string,now:number):Promise<ReleaseDiscovery>{
  const checkedAt=new Date(now).toISOString(),run=this.options.run??runUpdateCommand;
  try{
   const metadata=new Map<string,any>();
   const checks=await Promise.allSettled(officialPackageNames.map(async name=>{
    const value=JSON.parse(await run(root,"npm",["view",`${name}@latest`,"--json","--fetch-retries=0","--fetch-timeout=15000"]));
    if(value?.name!==name||!valid(value.version))throw new Error("NPM_UPDATE_IDENTITY");
    metadata.set(name,value);
   }));
   if(checks.some(result=>result.status==="rejected"))throw new Error("NPM_UPDATE_SOURCE_UNAVAILABLE");
   const releases=new Map<string,CompatibilityRelease>();
   for(const [name,pkg]of metadata){
    if(pkg.agentUI===undefined)continue; // Old npm versions can coexist with newer metadata publishers.
    if(pkg.agentUI.schemaVersion!==1)throw new Error("NPM_UPDATE_SCHEMA");
    const manifest=parseCompatibilityManifest(pkg.agentUI.compatibility);
    if(!manifest.releases.some(release=>release.packages.some(entry=>entry.name===name&&entry.version===pkg.version)))throw new Error("NPM_UPDATE_METADATA_IDENTITY");
    for(const release of manifest.releases){
     const previous=releases.get(release.id);
     if(previous&&JSON.stringify(previous)!==JSON.stringify(release))throw new Error("NPM_UPDATE_RELEASE_CONFLICT");
     releases.set(release.id,release);
    }
   }
   if(!releases.size)throw new Error("NPM_UPDATE_METADATA_MISSING");
   const published=new Map<string,Promise<boolean>>();
   const exists=(name:string,version:string)=>{
    const key=`${name}@${version}`;let result=published.get(key);if(result)return result;
    const pkg=metadata.get(name);
    if(pkg?.version===version||Array.isArray(pkg?.versions)&&pkg.versions.includes(version))result=Promise.resolve(true);
    else result=run(root,"npm",["view",key,"version","--json","--fetch-retries=0","--fetch-timeout=15000"]).then(text=>JSON.parse(text)===version,()=>false);
    published.set(key,result);return result;
   };
   // Partial publication must never advertise a combination that cannot yet be installed.
   const available:CompatibilityRelease[]=[];
   for(const release of releases.values())if((await Promise.all(release.packages.map(pkg=>exists(pkg.name,pkg.version)))).every(Boolean))available.push(release);
   if(!available.length)throw new Error("NPM_UPDATE_RELEASE_NOT_PUBLISHED");
   const manifest=parseCompatibilityManifest({schemaVersion:1,releases:available.sort((a,b)=>a.id.localeCompare(b.id))});
   const identities=new Map(this.identities.get(root));
   for(const release of manifest.releases){const digest=createHash("sha256").update(JSON.stringify(release)).digest("hex");if(identities.has(release.id)&&identities.get(release.id)!==digest)throw new Error("NPM_UPDATE_IMMUTABLE_RELEASE");identities.set(release.id,digest);}
   this.identities.set(root,identities);
   const result:ReleaseDiscovery={status:"online",checkedAt,fetchedAt:checkedAt,manifest,digest:createHash("sha256").update(JSON.stringify(manifest)).digest("hex")};this.cache.set(root,result);return result;
  }catch{
   const previous=this.cache.get(root);if(previous){const result:ReleaseDiscovery={...previous,status:"cached",checkedAt,issue:"UPDATE_SOURCE_UNAVAILABLE"};this.cache.set(root,result);return result;}
   return {status:"unavailable",checkedAt,issue:"UPDATE_SOURCE_UNAVAILABLE"};
  }
 }
}
