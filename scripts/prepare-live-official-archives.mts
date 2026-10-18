import {mkdtemp,writeFile,readdir,readFile,cp} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnPnpm} from "./pnpm-process.mjs";
const repo=fileURLToPath(new URL("..",import.meta.url));const output=await mkdtemp(path.join(tmpdir(),"creator-official-archives-"));
for(const name of ["core","renderer","runtime","web-component","operator","creator"]){await new Promise<void>((resolve,reject)=>{let log="";const child=spawnPnpm(["pack","--pack-destination",output],{cwd:path.join(repo,"packages",name),env:{...process.env,npm_config_ignore_scripts:"true"},stdio:["ignore","pipe","pipe"]});child.stdout.on("data",c=>log+=c);child.stderr.on("data",c=>log+=c);child.once("error",reject);child.once("close",code=>code===0?resolve():reject(Error(log)));});console.log("PACKED",name);}
for(const name of ["runtime","web-component"]){
 const stage=await mkdtemp(path.join(tmpdir(),`creator-${name}-candidate-`));
 const manifest=JSON.parse(await readFile(path.join(repo,"packages",name,"package.json"),"utf8"));manifest.version="0.0.2";
 for(const section of ["dependencies","peerDependencies","devDependencies"])for(const [key,value] of Object.entries(manifest[section]??{}))if(String(value).startsWith("workspace:"))manifest[section][key]=["@za38.03/agent-ui-plugins","@za38.03/agent-ui-runtime"].includes(key)?"0.0.2":"0.0.1";
 await writeFile(path.join(stage,"package.json"),JSON.stringify(manifest,null,2));await cp(path.join(repo,"packages",name,"dist"),path.join(stage,"dist"),{recursive:true});
 await new Promise<void>((resolve,reject)=>{const child=spawnPnpm(["pack","--pack-destination",output],{cwd:stage,env:{...process.env,npm_config_ignore_scripts:"true"},stdio:"ignore"});child.once("error",reject);child.once("close",code=>code===0?resolve():reject(Error(`candidate ${name}: ${code}`)));});
}
const file=path.join(output,"archives.json");await writeFile(file,JSON.stringify((await readdir(output)).filter(file=>file.endsWith(".tgz")).map(file=>path.join(output,file)),null,2));console.log("ARCHIVES",file);
