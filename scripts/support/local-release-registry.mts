/** Real npm test registry backed by built official tgz and installed third-party payloads. Never publishes externally. */
import { createServer } from "node:http";
import { readFile, readdir, mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readNpmArchive, runUpdateCommand } from "../../packages/operator/src/updates/npm-artifact.js";
export async function createLocalReleaseRegistry(repo:string,archives:string[]){
 const root=process.env.CREATOR_ACCEPTANCE_REGISTRY_CACHE??await mkdtemp(path.join(tmpdir(),"creator-real-npm-registry-"));await mkdir(path.join(root,"archives"),{recursive:true});
 const index=new Map<string,Map<string,{manifest:any;directory?:string;archive?:Buffer}>>();
 const add=(manifest:any,value:any)=>{if(!manifest.name||!manifest.version)return;const versions=index.get(manifest.name)??new Map();if(!versions.has(manifest.version))versions.set(manifest.version,{manifest,...value});index.set(manifest.name,versions);};
 for(const entry of await readdir(path.join(repo,"node_modules/.pnpm"),{withFileTypes:true})){
  if(!entry.isDirectory()||entry.name==="node_modules")continue;
  const modules=path.join(repo,"node_modules/.pnpm",entry.name,"node_modules");
  for(const directory of await readdir(modules,{withFileTypes:true}).catch(()=>[])){
   const base=path.join(modules,directory.name);
   const candidates=directory.name.startsWith("@")?(await readdir(base).catch(()=>[])).map(name=>path.join(base,name)):[base];
   for(const directory of candidates)try{add(JSON.parse(await readFile(path.join(directory,"package.json"),"utf8")),{directory});}catch{}
  }
 }
 for(const file of archives){const archive=await readFile(file),files=readNpmArchive(archive),manifest=JSON.parse(files.get("package/package.json")!.toString());const versions=index.get(manifest.name)??new Map();versions.set(manifest.version,{manifest,archive});index.set(manifest.name,versions);}
 const require=createRequire(path.join(repo,"packages/operator/package.json"));const {rcompare}=require("semver");
 const packing=new Map<string,Promise<void>>();let hits=0,tarballHits=0;const missing=new Set<string>();let feed:any;
 const archive=async(name:string,version:string)=>{const key=`${name}@${version}`,entry=index.get(name)?.get(version);if(!entry)throw Error("REGISTRY_VERSION_MISSING");if(!entry.archive){entry.archive=await readFile(path.join(root,"archives",`${name.replace("@","").replace("/","-")}-${version}.tgz`)).catch(()=>undefined);}if(!entry.archive){if(!packing.has(key))packing.set(key,(async()=>{const info=JSON.parse(await runUpdateCommand(entry.directory!,"npm",["pack","--ignore-scripts","--json","--logs-max=5000","--pack-destination",path.join(root,"archives")]))[0];entry.archive=await readFile(path.join(root,"archives",info.filename));})());await packing.get(key);}return entry.archive!;};
 let url="";
 const server=createServer((req,res)=>void(async()=>{
  hits++;const pathname=new URL(req.url!,"http://localhost").pathname;
  if(pathname==="/compatibility.json"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify(feed));return;}
  if(pathname.startsWith("/tar/")){const [name,version]=pathname.slice(5).split("/").map(decodeURIComponent);tarballHits++;res.setHeader("Content-Type","application/octet-stream");res.end(await archive(name!,version!));return;}
  const decoded=decodeURIComponent(pathname.slice(1));let name=decoded,version:string|undefined;
  if(!index.has(name)){const at=decoded.lastIndexOf("/");name=decoded.slice(0,at);version=decoded.slice(at+1);}
  const entries=index.get(name);if(!entries){missing.add(decoded);res.writeHead(404);res.end(JSON.stringify({error:"Package is not installed in the acceptance workspace"}));return;}
  const versions:any={};
  for(const [version,entry] of entries){
   // Pack only requested packages; metadata needs integrity for selected versions.
   const bytes=await archive(name,version);versions[version]={...entry.manifest,dist:{tarball:`${url}/tar/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,integrity:`sha512-${createHash("sha512").update(bytes).digest("base64")}`,shasum:createHash("sha1").update(bytes).digest("hex")}};
  }
  res.setHeader("Content-Type","application/json");res.end(JSON.stringify(version?versions[version]:{name,"dist-tags":{latest:[...entries.keys()].sort(rcompare)[0]},versions}));
 })().catch(error=>{console.log("REGISTRY_REQUEST_FAILED",req.url,String(error));if(!res.headersSent)res.writeHead(500);res.end(JSON.stringify({error:"Archive preparation failed"}));}));
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const official=["core","renderer","runtime","plugins","web-component","creator","operator"].map(id=>`@za38.03/agent-ui-${id}`);
 const packages=official.map(name=>{const version=["-plugins","-runtime","-web-component"].some(suffix=>name.endsWith(suffix))?"0.0.2":"0.0.1",entry=index.get(name)?.get(version);if(!entry)throw Error(`Missing built official archive: ${name}@${version}`);return {name,version,requires:Object.fromEntries(Object.entries({...entry.manifest.peerDependencies,...entry.manifest.dependencies}).filter(([name])=>official.includes(name))),historyFrom:"0.0.1",changes:name.endsWith("-plugins")?[{id:"composer-counter",version:"0.0.2",summary:"Composer 新增实时输入字数统计",kind:"feature",pluginId:"composer"}]:[]};});
 feed={schemaVersion:1,releases:[{id:"acceptance-real-npm-composer-counter",publishedAt:"2026-10-18T00:00:00Z",channel:"stable",minimumCreatorVersion:"0.0.1",minimumOperatorVersion:"0.0.1",react:">=18 <20",packages}]};
 return {url,root,index,feed,stats:()=>({metadataAndArchiveRequests:hits,tarballRequests:tarballHits,missing:[...missing]}),close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
