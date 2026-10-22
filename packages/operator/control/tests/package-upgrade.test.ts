// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PackageUpgradeService } from "../src/updates/package-upgrade-service";
import { PackageUpdateService } from "../src/updates/package-update-service";
import { HttpCompatibilityReleaseProvider } from "../src/updates/release-provider";
import { runUpdateCommand, verifyNpmArtifact } from "../src/updates/npm-artifact";
import { officialPackageNames } from "../src/updates/compatibility-release";
import { resourcePackageInvocation } from "../src/project/ensure-resource-packages";
const roots:string[]=[],servers:Server[]=[];
afterEach(async()=>{for(const server of servers.splice(0)){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
const coreName="@za38.03/agent-ui-core";
const name=coreName;
async function setup(manager:"npm"|"pnpm"="npm", plugins=false){
  const name=plugins?"@za38.03/agent-ui-plugins":coreName;
  const root=await mkdtemp(path.join(tmpdir(),"npm升级 空格-"));roots.push(root);const project=path.join(root,"project"),tools=path.join(root,"tools");await mkdir(project);await mkdir(tools);
  const archives=new Map<string,Buffer>();
  for(const version of ["0.0.1","0.0.2"]){const pkg=path.join(root,version);await mkdir(pkg);await writeFile(path.join(pkg,"package.json"),JSON.stringify({name,version,main:"index.cjs"}));await writeFile(path.join(pkg,"index.cjs"),`module.exports=${JSON.stringify(version)}`);if(plugins){
      const repo=path.resolve(import.meta.dirname,"../../../..");const metadata=JSON.parse(await readFile(path.join(repo,"packages/plugins/package.json"),"utf8"));
      // Built official snapshot/runtime payload; dependency-free registry fixture isolates the transaction from unrelated public downloads.
      await writeFile(path.join(pkg,"package.json"),JSON.stringify({name,version,type:"module",exports:metadata.exports}));
      await cp(path.join(repo,"packages/plugins/dist"),path.join(pkg,"dist"),{recursive:true});
      const catalogFile=path.join(pkg,"dist/catalog.json"),catalog=JSON.parse(await readFile(catalogFile,"utf8"));catalog.package.version=version;
      if(version==="0.0.2"){
        const record=catalog.plugins.find((p:{id:string})=>p.id==="composer");record.version=version;
        for(const file of record.takeover.files){
          if(file.target!=="manifest.json"&&file.target!=="adapters/composer.tsx")continue;
          const absolute=path.join(pkg,"dist",file.path),original=await readFile(absolute,"utf8");
          const target=file.target==="manifest.json"?JSON.stringify({...JSON.parse(original),version}):original+"\nexport const npmUpgradeFeature = true;\n";
          await writeFile(absolute,target);file.sha256=createHash("sha256").update(target).digest("hex");
          if(file.target==="adapters/composer.tsx"){
            const runtime=record.takeover.runtimeFiles.find((p:{path:string})=>p.path==="plugins/composer/adapters/presentation/composer.js");
            const {transform}=await import("esbuild");const output=(await transform(target,{loader:"tsx",jsx:"automatic",format:"esm"})).code;
            await writeFile(path.join(pkg,"dist",runtime.path),output);runtime.sha256=createHash("sha256").update(output).digest("hex");
          }
        }
      }
      await writeFile(catalogFile,JSON.stringify(catalog));
    }
    const packed=JSON.parse(await runUpdateCommand(pkg,"npm",["pack","--ignore-scripts","--json"]));archives.set(version,await readFile(path.join(pkg,packed[0].filename)));}
  let badIntegrity=false;
  const release={id:"stable-2",publishedAt:"2026-10-18T00:00:00Z",channel:"stable",packages:officialPackageNames.map(n=>({name:n,version:n===name?"0.0.2":"0.0.1",requires:{},changes:[]}))};
  const server=createServer((req,res)=>{
    if(req.url==="/feed"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify({schemaVersion:1,releases:[release]}));return;}
    if(req.url?.startsWith("/tar/")){const bytes=archives.get(req.url.split("/").pop()!);res.end(bytes);return;}
    const versions=Object.fromEntries([...archives].map(([version,bytes])=>[version,{name,version,main:"index.cjs",dist:{tarball:`${url}/tar/${version}`,integrity:`sha512-${badIntegrity?Buffer.alloc(64).toString("base64"):createHash("sha512").update(bytes).digest("base64")}`,shasum:createHash("sha1").update(bytes).digest("hex")}}]));
    const requested=decodeURIComponent(req.url??"").split("/").pop()!;res.setHeader("Content-Type","application/json");res.end(JSON.stringify(versions[requested]??{name,"dist-tags":{latest:"0.0.2"},versions}));
  });servers.push(server);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  await writeFile(path.join(project,".npmrc"),`registry=${url}\naudit=false\nfund=false\n`);
  await writeFile(path.join(project,"package.json"),JSON.stringify({name:"consumer",version:"1.0.0",private:true,packageManager:manager==="npm"?"npm@10.9.2":"pnpm@8.12.0",dependencies:{[name]:"0.0.1"}}));
  await mkdir(path.join(project,"app-ui"));await writeFile(path.join(project,"app-ui","composer.tsx"),"// my props and composition\r\nexport const custom = true;\r\n");
  await mkdir(path.join(project,"plugins"));await writeFile(path.join(project,"plugins","owned.ts"),"// LOCAL custom source");await writeFile(path.join(project,"plugins","base.json"),'"original BASE"');
  await runUpdateCommand(project,manager,["install","--ignore-scripts"]);
  const provider=new HttpCompatibilityReleaseProvider(`${url}/feed`),overview=new PackageUpdateService(provider,{root:tools,creatorVersion:"0.0.1"});
  return {root:project,provider,overview,service:new PackageUpgradeService(provider,overview),bad(){badIntegrity=true;},release};
}
for(const manager of ["npm","pnpm"] as const)it(`installs verified artifacts with real ${manager}, updates its lock and preserves local files`,async()=>{
 const {root,service}=await setup(manager),before=await readFile(path.join(root,"app-ui/composer.tsx"));
 const plan=await service.plan(root);expect(plan.manager).toBe(manager);expect(plan.packages[0]!.target).toBe("0.0.2");
 expect(JSON.parse(await readFile(path.join(root,"package.json"),"utf8")).dependencies[name]).toBe("0.0.1");
 expect(await service.execute(root,plan.id)).toMatchObject({status:"installed"});
 expect(JSON.parse(await readFile(path.join(root,"node_modules",name,"package.json"),"utf8")).version).toBe("0.0.2");
 expect(await readFile(path.join(root,"app-ui/composer.tsx"))).toEqual(before);expect(await readFile(path.join(root,"plugins/owned.ts"),"utf8")).toBe("// LOCAL custom source");expect(await readFile(path.join(root,"plugins/base.json"),"utf8")).toBe('"original BASE"');
 expect(await service.recovery(root)).toBeNull();
},120000);
it("rejects stale plans and forged confirmation IDs without changing dependencies",async()=>{
 const {root,service}=await setup();await expect(service.execute(root,"invented")).rejects.toThrow("PACKAGE_PLAN_STALE");
 const plan=await service.plan(root);await writeFile(path.join(root,"app-ui/composer.tsx"),"// newer edit");await expect(service.execute(root,plan.id)).rejects.toThrow("PACKAGE_PLAN_STALE");expect(await service.recovery(root)).toBeNull();
},60000);
it("restores manifest, exact lock and actual old installed version after validation fails",async()=>{
 const {root,provider,overview}=await setup();const before=await readFile(path.join(root,"package.json"),"utf8"),lock=await readFile(path.join(root,"package-lock.json"),"utf8");
 let fail=true;const service=new PackageUpgradeService(provider,overview,async(root,command,args)=>{const output=await runUpdateCommand(root,command,args);if(fail&&args[0]==="install"){fail=false;throw new Error("injected validation failure");}return output;});
 const plan=await service.plan(root);expect(await service.execute(root,plan.id)).toMatchObject({status:"restored"});
 expect(await readFile(path.join(root,"package.json"),"utf8")).toBe(before);expect(await readFile(path.join(root,"package-lock.json"),"utf8")).toBe(lock);expect(JSON.parse(await readFile(path.join(root,"node_modules",name,"package.json"),"utf8")).version).toBe("0.0.1");
},60000);
it("persists failed recovery across service restart and retries the original lock install",async()=>{
 const {root,provider,overview}=await setup();let blocked=true;
 const service=new PackageUpgradeService(provider,overview,async(root,command,args)=>{if(blocked&&["install","ci"].includes(args[0]!))throw new Error("network down");return runUpdateCommand(root,command,args);});
 const plan=await service.plan(root);expect(await service.execute(root,plan.id)).toMatchObject({status:"recovery-required"});
 const restarted=new PackageUpgradeService(provider,overview);expect(await restarted.recovery(root)).toMatchObject({id:plan.id});await expect(restarted.plan(root)).rejects.toThrow("PACKAGE_RECOVERY_REQUIRED");blocked=false;
 expect(await restarted.recover(root,plan.id)).toMatchObject({status:"restored"});expect(await restarted.recovery(root)).toBeNull();
},60000);
it("verifies registry integrity and blocks workspace/local/override declarations before mutation",async()=>{
 const {root,service,bad}=await setup();bad();await expect(service.plan(root)).rejects.toThrow("PACKAGE_COMMAND_FAILED");
 await writeFile(path.join(root,"pnpm-workspace.yaml"),'packages: ["."]');await expect(service.plan(root)).rejects.toThrow("PACKAGE_WORKSPACE");
},60000);
it("retains concurrent user edits when recovery cannot safely restore",async()=>{
 const {root,provider,overview}=await setup();const service=new PackageUpgradeService(provider,overview,async(root,command,args)=>{const output=await runUpdateCommand(root,command,args);if(args[0]==="install"){await writeFile(path.join(root,"app-ui/composer.tsx"),"// user edit during install");throw new Error("failed");}return output;});
 const plan=await service.plan(root);expect(await service.execute(root,plan.id)).toMatchObject({status:"recovery-required"});expect(await readFile(path.join(root,"app-ui/composer.tsx"),"utf8")).toBe("// user edit during install");
},60000);
it("uses Windows command helpers without shell expansion and handles inherited JS launchers",()=>{
 expect(resourcePackageInvocation("npm",["install","--ignore-scripts"],"win32",{})).toEqual({command:"npm.cmd",args:['"install"','"--ignore-scripts"'],shell:true});
 expect(resourcePackageInvocation("npm",["view","@za38.03/agent-ui-core@0.0.2","--json"],"win32",{npm_execpath:"C:\\tools\\npm-cli.js"})).toMatchObject({command:process.execPath,shell:false});
});

it("real npm upgrade preserves Composer application/BASE and permits subsequent source conflict synchronization",async()=>{
 const {root,service}=await setup("npm",true);const repo=path.resolve(import.meta.dirname,"../../../..");
 for(const directory of [".agent-ui","src/ui/app-ui","src/ui/plugins","src/ui/runtime","src/ui/services","src/ui/agent-ui/i18n"])await mkdir(path.join(root,directory),{recursive:true});
 await writeFile(path.join(root,".agent-ui/project.json"),JSON.stringify({mode:"assistant",sourceRoot:"src/ui"}));
 await cp(path.join(repo,"packages/plugins/resources/registry/items/foundation/core-contracts/files/framework"),path.join(root,"src/ui/framework"),{recursive:true});
 await writeFile(path.join(root,"src/ui/services/agent-ui-locale.ts"),'export const AGENT_UI_LOCALE_SERVICE = "agent-ui.locale";');
 await writeFile(path.join(root,"src/ui/agent-ui/i18n/useAgentUILocale.ts"),'export {useAgentUILocale} from "@za38.03/agent-ui-plugins";');
 await writeFile(path.join(root,"src/ui/runtime/composition.ts"),'export const createPluginCapabilityCatalog = (entries:unknown[]) => entries;');
 const model=JSON.stringify({root:{type:"slot",plugins:[{id:"existing-composer",pluginId:"composer",enabled:true}]}});await writeFile(path.join(root,"src/ui/app-ui/app-ui.json"),model);
 const manifest=JSON.parse(await readFile(path.join(root,"package.json"),"utf8"));manifest.scripts={build:"node check.cjs"};
 await writeFile(path.join(root,"check.cjs"),'JSON.parse(require("fs").readFileSync("src/ui/plugins/composer/application.json","utf8"));');
 await writeFile(path.join(root,"package.json"),JSON.stringify(manifest));await runUpdateCommand(root,"npm",["install","--ignore-scripts"]);
 const {ensurePluginApplication}=await import("../src/project/plugin-application");const {planPluginSourceTakeover,takeoverPluginSource,planPluginSourceSync,syncPluginSource}=await import("../src/project/takeover-plugin-source");
 await ensurePluginApplication(root,"composer");const appPath=path.join(root,"src/ui/plugins/composer/index.tsx");await writeFile(appPath,(await readFile(appPath,"utf8")).replace("{...props} />",'{...props} inputProps={{placeholder:"kept app placeholder"}} />')+"\r\n// preserved props/composition customization\r\n");
 const validate=async(staged:string)=>{const {transform}=await import("esbuild");await transform(await readFile(path.join(staged,"src/ui/plugins/composer/source/adapters/composer.tsx"),"utf8"),{loader:"tsx"});};
 const takeover=await planPluginSourceTakeover(root,{pluginId:"composer"});await takeoverPluginSource(root,{pluginId:"composer",planHash:takeover.planHash},validate);
 const source=path.join(root,"src/ui/plugins/composer/source/adapters/composer.tsx"),original=await readFile(source,"utf8");await writeFile(source,original+"\n// kept local adapter customizations\n");
 const application=await readFile(appPath),local=await readFile(source),ownershipPath=path.join(root,".agent-ui/plugin-ownership.json"),base=await readFile(ownershipPath);
 const plan=await service.plan(root);const installedResult=await service.execute(root,plan.id);expect(installedResult.failure).toBeUndefined();expect(installedResult).toMatchObject({status:"installed",checks:["build"]});
 expect(await readFile(appPath)).toEqual(application);expect(await readFile(source)).toEqual(local);expect(await readFile(ownershipPath)).toEqual(base);expect(await readFile(path.join(root,"src/ui/app-ui/app-ui.json"),"utf8")).toBe(model);
 const sync=await planPluginSourceSync(root,{pluginId:"composer"});expect(sync.package.version).toBe("0.0.2");
 await expect(syncPluginSource(root,{pluginId:"composer",planHash:sync.planHash},validate)).rejects.toMatchObject({code:"PLUGIN_SOURCE_MERGE_REQUIRED"});
 const target=Buffer.from(sync.mergeFiles.find(file=>file.path==="adapters/composer.tsx")!.target!,"base64").toString();
 await syncPluginSource(root,{pluginId:"composer",planHash:sync.planHash,resolutions:{"adapters/composer.tsx":target+"\n// kept local adapter customizations\n"}},validate);
 expect(await readFile(appPath)).toEqual(application);expect(await readFile(source,"utf8")).toContain("npmUpgradeFeature");expect(await readFile(source,"utf8")).toContain("kept local adapter customizations");expect(JSON.parse(await readFile(ownershipPath,"utf8")).plugins.composer.package.version).toBe("0.0.2");
},120000);
it("invalidates a reviewed plan when its lockfile changes",async()=>{
 const {root,service}=await setup();const plan=await service.plan(root);const file=path.join(root,"package-lock.json");await writeFile(file,(await readFile(file,"utf8"))+"\n");await expect(service.execute(root,plan.id)).rejects.toThrow("PACKAGE_PLAN_STALE");expect(await service.recovery(root)).toBeNull();
},60000);
it("leaves an interrupted unknown installation for review instead of racing an orphan package manager",async()=>{
 const {root,service}=await setup();const file=path.join(root,".agent-ui-npm-update.json");await writeFile(file,JSON.stringify({schemaVersion:1,id:"crash",root:await import("node:fs/promises").then(fs=>fs.realpath(root)),manager:"npm",lockfile:"package-lock.json",state:"installing"}));
 const before=await readFile(path.join(root,"package.json"));expect(await service.recover(root,"crash")).toMatchObject({status:"recovery-required",failure:"PACKAGE_INTERRUPTED_INSTALL_REQUIRES_REVIEW"});expect(await readFile(path.join(root,"package.json"))).toEqual(before);
},60000);
it("shares Operator cross-process admission and does not install while another operation owns it",async()=>{
 const {root,service}=await setup();const plan=await service.plan(root);const {acquireOperatorLock}=await import("../src/project/operator-lock");const release=await acquireOperatorLock(root);
 try{await expect(service.execute(root,plan.id)).rejects.toThrow("Another Host request");expect(await service.recovery(root)).toBeNull();}finally{await release();}
},60000);
it("detects installed content drift even when the target version and lock integrity look correct",async()=>{
 const {root,provider,overview}=await setup();const service=new PackageUpgradeService(provider,overview,async(root,command,args)=>{const output=await runUpdateCommand(root,command,args);if(args[0]==="install")await writeFile(path.join(root,"node_modules",name,"index.cjs"),'module.exports="tampered"');return output;});
 const plan=await service.plan(root);expect(await service.execute(root,plan.id)).toMatchObject({status:"restored",failure:"PACKAGE_INSTALLED_ARTIFACT"});expect(await readFile(path.join(root,"node_modules",name,"index.cjs"),"utf8")).toContain("0.0.1");
},60000);
