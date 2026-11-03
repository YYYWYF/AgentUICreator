import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { satisfies } from "semver";
import { resourcePackageInvocation } from "../project/ensure-resource-packages.js";
import { assertNoSymbolicLinkTraversal } from "../project/source-registry/path-policy.js";
import { officialPackageNames, type CompatibilityRelease } from "./compatibility-release.js";

export type UpdateCommand = (root: string, command: string, args: string[]) => Promise<string>;
/** Never expose package-manager output: it can contain registry credentials. */
export const runUpdateCommand: UpdateCommand = (root, command, args) => new Promise((resolve,reject)=>{
  const invocation=resourcePackageInvocation(command,args);
  const child=spawn(invocation.command,invocation.args,{cwd:root,shell:invocation.shell,detached:process.platform!=="win32",stdio:["ignore","pipe","pipe"]});
  let output="",done=false,timedOut=false;
  const stop=()=>{
    timedOut=true;
    if(process.platform==="win32"&&child.pid){spawn("taskkill.exe",["/pid",String(child.pid),"/t","/f"],{stdio:"ignore",shell:false}).once("error",()=>child.kill());}
    else if(child.pid){try{process.kill(-child.pid,"SIGKILL");}catch{child.kill("SIGKILL");}}
  };
  const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(output);};
  const timer=setTimeout(stop,300_000);
  child.stdout.on("data",chunk=>{output+=chunk.toString();if(output.length>4_000_000)stop();});
  child.stderr.resume();child.once("error",()=>finish(new Error("PACKAGE_COMMAND_FAILED")));
  child.once("close",code=>finish(code===0&&!timedOut&&output.length<=4_000_000?undefined:new Error("PACKAGE_COMMAND_FAILED")));
});
function parseJson(value:string){try{return JSON.parse(value);}catch{throw new Error("PACKAGE_ARTIFACT_INVALID");}}
export interface VerifiedArtifact { name:string; version:string; integrity:string; manifest:Record<string,any>; files:Map<string,Buffer> }
/** Read ordinary files only, without ever extracting archive paths or running package scripts. */
export function readNpmArchive(bytes:Buffer):Map<string,Buffer> {
  const tar=gunzipSync(bytes,{maxOutputLength:256*1024*1024}),files=new Map<string,Buffer>(),names=new Set<string>();
  let nextPath:string|undefined;
  for(let offset=0;offset+512<=tar.length;){
    const header=tar.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;
    const string=(start:number,length:number)=>header.subarray(start,start+length).toString().replace(/\0.*$/s,"");
    const prefix=string(345,155),headerName=(prefix?`${prefix}/`:"")+string(0,100),size=parseInt(string(124,12).trim()||"0",8);
    if(!Number.isSafeInteger(size)||size<0||offset+512+size>tar.length)throw new Error("PACKAGE_ARTIFACT_INVALID");
    const content=tar.subarray(offset+512,offset+512+size),type=header[156];
    if(type===120){
      // PAX lengths count bytes, including UTF-8 and the trailing newline.
      for(let cursor=0;cursor<content.length;){
        const space=content.indexOf(32,cursor),length=Number(content.subarray(cursor,space).toString());
        if(space<cursor||!Number.isSafeInteger(length)||length<=space-cursor+1||cursor+length>content.length)throw new Error("PACKAGE_ARTIFACT_INVALID");
        const record=content.subarray(space+1,cursor+length-1).toString();
        if(record.startsWith("path="))nextPath=record.slice(5);
        if(record.startsWith("size="))throw new Error("PACKAGE_ARTIFACT_INVALID");
        cursor+=length;
      }
    }else if(type===76){nextPath=content.toString().replace(/\0.*$/s,"");}
    else if(type===0||type===48){
      const name=nextPath??headerName;nextPath=undefined;
      if(!name.startsWith("package/")||name.includes("\\")||name.includes("\0")||path.posix.normalize(name)!==name||names.has(name.toLowerCase()))throw new Error("PACKAGE_ARTIFACT_INVALID");
      if(files.size>=50000)throw new Error("PACKAGE_ARTIFACT_INVALID");
      names.add(name.toLowerCase());files.set(name,content);
    }else if(type!==53)throw new Error("PACKAGE_ARTIFACT_INVALID");
    offset+=512+Math.ceil(size/512)*512;
  }
  if(nextPath||!files.has("package/package.json"))throw new Error("PACKAGE_ARTIFACT_INVALID");
  return files;
}
/** Verify the bytes actually installed, including catalog and source assets, not only a version label. */
export async function verifyInstalledArtifact(installedRoot:string,artifact:VerifiedArtifact){
  for(const [file,bytes] of artifact.files){
    const relative=file.slice("package/".length);
    await assertNoSymbolicLinkTraversal(installedRoot,relative);
    const actual=await readFile(path.join(installedRoot,...relative.split("/")));
    if(!actual.equals(bytes))throw new Error("PACKAGE_INSTALLED_ARTIFACT");
  }
}

export async function verifyNpmArtifact(root:string,target:CompatibilityRelease["packages"][number],release:CompatibilityRelease,run:UpdateCommand=runUpdateCommand):Promise<VerifiedArtifact>{
  const directory=await mkdtemp(path.join(tmpdir(),"agent-ui-artifact-"));
  try{
    // npm inherits the target project's registry/.npmrc authentication; never assume public npm.
    const metadata=parseJson(await run(root,"npm",["view",`${target.name}@${target.version}`,"--json","--fetch-retries=0","--fetch-timeout=15000"]));
    const expected=metadata.dist?.integrity;
    if(metadata.name!==target.name||metadata.version!==target.version||typeof expected!=="string"||!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(expected))throw new Error("PACKAGE_ARTIFACT_IDENTITY");
    const packed=parseJson(await run(root,"npm",["pack",`${target.name}@${target.version}`,"--ignore-scripts","--json","--pack-destination",directory,"--fetch-retries=0","--fetch-timeout=15000"]));
    const file=packed[0]?.filename;
    if(typeof file!=="string"||path.basename(file)!==file||file.includes("\\"))throw new Error("PACKAGE_ARTIFACT_INVALID");
    const bytes=await readFile(path.join(directory,file));
    if(bytes.length>128*1024*1024||`sha512-${createHash("sha512").update(bytes).digest("base64")}`!==expected)throw new Error("PACKAGE_ARTIFACT_INTEGRITY");
    const files=readNpmArchive(bytes),manifest=parseJson(files.get("package/package.json")?.toString()??"null");
    if(manifest?.name!==target.name||manifest.version!==target.version)throw new Error("PACKAGE_ARTIFACT_IDENTITY");
    const actual={...manifest.peerDependencies,...manifest.dependencies};
    for(const name of officialPackageNames){
      if(actual[name]!==undefined&&actual[name]!==target.requires[name])throw new Error("PACKAGE_ARTIFACT_REQUIREMENTS");
      if(target.requires[name]!==undefined&&actual[name]!==target.requires[name])throw new Error("PACKAGE_ARTIFACT_REQUIREMENTS");
      const required=actual[name],selected=release.packages.find(pkg=>pkg.name===name);
      if(required&&(!selected||!satisfies(selected.version,required)))throw new Error("PACKAGE_ARTIFACT_REQUIREMENTS");
    }
    return {name:target.name,version:target.version,integrity:expected,manifest,files};
  }finally{await rm(directory,{recursive:true,force:true});}
}
