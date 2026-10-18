/** Build two real local npm archives without modifying the working implementation. */
import {cp,mkdir,mkdtemp,readFile,writeFile,symlink,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnPnpm} from "./pnpm-process.mjs";
const repo=fileURLToPath(new URL("..",import.meta.url));
const root=await mkdtemp(path.join(tmpdir(),"composer-live-releases-"));
const archives=path.join(root,"archives");await mkdir(archives);
async function command(args:string[],cwd:string){await new Promise<void>((resolve,reject)=>{const child=spawnPnpm(args,{cwd,env:{...process.env,npm_config_ignore_scripts:"true",npm_config_verify_deps_before_run:"false"},stdio:["ignore","pipe","pipe"]});let output="";child.stdout.on("data",chunk=>output+=chunk);child.stderr.on("data",chunk=>output+=chunk);child.once("error",reject);child.once("close",code=>code===0?(console.log("PREPARED",args.join(" "),cwd),resolve()):reject(Error(`pnpm ${args.join(" ")} exited ${code}: ${output.slice(-4000)}`)));});}
for(const version of ["0.0.1","0.0.2"]){
 const stage=path.join(root,version);const pkgRoot=path.join(stage,"packages/plugins");await mkdir(path.dirname(pkgRoot),{recursive:true});
 await cp(path.join(repo,"packages/plugins"),pkgRoot,{recursive:true,filter:file=>!["node_modules",".generated"].includes(path.relative(path.join(repo,"packages/plugins"),file).split(path.sep)[0]!)});
 for(const [target,destination] of [[path.join(repo,"scripts"),path.join(stage,"scripts")],[path.join(repo,"node_modules"),path.join(stage,"node_modules")],[path.join(repo,"packages/plugins/node_modules"),path.join(pkgRoot,"node_modules")],...["operator","runtime","core","renderer"].map(name=>[path.join(repo,"packages",name),path.join(stage,"packages",name)])])await symlink(target!,destination!,process.platform==="win32"?"junction":"dir");
 await cp(path.join(repo,"assistant-ui-upgrade-target.json"),path.join(stage,"assistant-ui-upgrade-target.json"));
 await cp(path.join(repo,"pnpm-lock.yaml"),path.join(stage,"pnpm-lock.yaml"));
 await writeFile(path.join(pkgRoot,".npmrc"),"verify-deps-before-run=false\n");
 await writeFile(path.join(pkgRoot,"pnpm-workspace.yaml"),"verifyDepsBeforeRun: false\n");
 const pkg=JSON.parse(await readFile(path.join(pkgRoot,"package.json"),"utf8"));pkg.version=version;
 for(const section of ["dependencies","devDependencies","peerDependencies"])for(const [key,value] of Object.entries(pkg[section]??{}))if(String(value).startsWith("workspace:"))pkg[section][key]="0.0.1";
 // Tarballs are private test candidates; building is explicit, never publishing.
 delete pkg.scripts.prepublishOnly;
 await writeFile(path.join(pkgRoot,"package.json"),JSON.stringify(pkg,null,2));
 if(version==="0.0.2"){
  const manifestPath=path.join(pkgRoot,"src/plugins/composer/plugin.json");const manifest=JSON.parse(await readFile(manifestPath,"utf8"));manifest.version=version;await writeFile(manifestPath,JSON.stringify(manifest,null,2));
  const changelogPath=path.join(pkgRoot,"src/plugins/composer/CHANGELOG.json");const changelog=JSON.parse(await readFile(changelogPath,"utf8"));changelog[version]={summary:"增加输入字数统计",changes:["输入框下方实时显示草稿字数；保留现有操作区与语义插槽。"]};await writeFile(changelogPath,JSON.stringify(changelog,null,2));
  const sourcePath=path.join(pkgRoot,"src/plugins/composer/adapters/presentation/composer.tsx");let source=await readFile(sourcePath,"utf8");
  source=source.replace('"use client";','"use client";\nimport { useConversationComposer } from "@za38.03/agent-ui-plugins";');
  source=source.replace('  const inheritedHostConfig =','  const { text } = useConversationComposer();\n  const counterMessages = useAgentUILocale("composer");\n  const inheritedHostConfig =');
  source=source.replace('          <div data-slot="aui_composer-actions"','          <output data-agent-ui-owned="" data-slot="aui-composer-character-count" aria-label={counterMessages.input} aria-live="polite" className="px-2 text-xs text-muted-foreground">{text.length}</output>\n          <div data-slot="aui_composer-actions"');
  await writeFile(sourcePath,source);
 }
 await command(["run","build"],pkgRoot);
 await command(["pack","--pack-destination",archives],pkgRoot);
}
await writeFile(path.join(root,"releases.json"),JSON.stringify({root,archives,files:await readdir(archives)},null,2));
console.log("LIVE_RELEASES",path.join(root,"releases.json"));
