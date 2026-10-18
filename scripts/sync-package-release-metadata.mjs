/** One reviewed release history, shipped both in npm metadata and the package payload. */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {fileURLToPath,pathToFileURL} from "node:url";
import path from "node:path";
const repositoryRoot=fileURLToPath(new URL("..",import.meta.url));
const modules=["core","renderer","runtime","plugins","operator","creator","web-component"];
export async function syncPackageReleaseMetadata(id,root=repositoryRoot){
 if(!modules.includes(id))throw new Error("Unknown public package");
 const file=path.join(root,"packages",id,"package.json");
 const pkg=JSON.parse(await readFile(file,"utf8"));
 const manifest=JSON.parse(await readFile(path.join(root,"releases/compatibility.json"),"utf8"));
 if(manifest.schemaVersion!==1||!Array.isArray(manifest.releases))throw new Error("Invalid reviewed release manifest");
 const current=manifest.releases.findLast(release=>release.packages.some(entry=>entry.name===pkg.name&&entry.version===pkg.version));
 if(!current)throw new Error(`Review compatibility metadata before publishing ${pkg.name}@${pkg.version}`);
 const versions=new Map(current.packages.map(entry=>[entry.name,entry.version]));
 const expected=Object.fromEntries(Object.entries({...pkg.peerDependencies,...pkg.dependencies}).filter(([name])=>versions.has(name)).map(([name,range])=>[name,range.startsWith("workspace:")?versions.get(name):range]));
 const recorded=current.packages.find(entry=>entry.name===pkg.name).requires;
 if(JSON.stringify(Object.entries(expected).sort())!==JSON.stringify(Object.entries(recorded).sort()))throw new Error(`Stale release requirements: ${pkg.name}`);
 pkg.agentUI={schemaVersion:1,compatibility:manifest};
 const text=JSON.stringify(pkg,null,2)+"\n";if(text!==await readFile(file,"utf8"))await writeFile(file,text);
 await mkdir(path.join(root,"packages",id,"dist"),{recursive:true});
 await writeFile(path.join(root,"packages",id,"dist/compatibility.json"),JSON.stringify(manifest,null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)for(const id of process.argv.slice(2).length?process.argv.slice(2):modules)await syncPackageReleaseMetadata(id);
