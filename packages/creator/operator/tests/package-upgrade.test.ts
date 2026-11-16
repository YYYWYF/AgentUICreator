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
import { runUpdateCommand } from "../src/updates/npm-artifact";
import { officialPackageNames } from "../src/updates/compatibility-release";
import { resourcePackageInvocation } from "../src/project/ensure-resource-packages";
const roots:string[]=[],servers:Server[]=[];
// Upgrade fixtures include two complete published Plugin trees and installed
// consumers; cleanup must finish before the next test starts.
afterEach(async()=>{for(const server of servers.splice(0)){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});},120_000);
const coreName="@za38.03/agent-ui-core";
const name=coreName;
async function setup(manager:"npm"|"pnpm"="npm", plugins=false, versions=["0.0.1","0.0.2"]){
  const name=plugins?"@za38.03/agent-ui-plugins":coreName;
  const root=await mkdtemp(path.join(tmpdir(),"npm升级 空格-"));roots.push(root);const project=path.join(root,"project"),tools=path.join(root,"tools");await mkdir(project);await mkdir(tools);
  const archives=new Map<string,Buffer>();
  for(const version of versions){const pkg=path.join(root,version);await mkdir(pkg);await writeFile(path.join(pkg,"package.json"),JSON.stringify({name,version,main:"index.cjs"}));await writeFile(path.join(pkg,"index.cjs"),`module.exports=${JSON.stringify(version)}`);if(plugins){
      const repo=path.resolve(import.meta.dirname,"../../../..");const metadata=JSON.parse(await readFile(path.join(repo,"packages/plugins/package.json"),"utf8"));
      // Built official snapshot/runtime payload; dependency-free registry fixture isolates the transaction from unrelated public downloads.
      await writeFile(path.join(pkg,"package.json"),JSON.stringify({name,version,type:"module",exports:metadata.exports}));
      await cp(path.join(repo,"packages/plugins/dist"),path.join(pkg,"dist"),{recursive:true});
      const catalogFile=path.join(pkg,"dist/catalog.json"),catalog=JSON.parse(await readFile(catalogFile,"utf8"));catalog.package.version=version;
      // This registry fixture deliberately publishes no third-party dependencies.
      // Dependency planning and real presentation typechecks have separate coverage.
      for (const record of catalog.plugins) if (record.takeover) record.takeover.requiredDependencies = {};
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
  await writeFile(path.join(project,".npmrc"),`registry=${url}\n@za38.03:registry=${url}\naudit=false\nfund=false\n`);
  await writeFile(path.join(project,"package.json"),JSON.stringify({name:"consumer",version:"1.0.0",private:true,packageManager:manager==="npm"?"npm@10.9.2":"pnpm@8.12.0",dependencies:{[name]:"0.0.1"}}));
  await mkdir(path.join(project,"app-ui"));await writeFile(path.join(project,"app-ui","composer.tsx"),"// my props and composition\r\nexport const custom = true;\r\n");
  await mkdir(path.join(project,"plugins"));await writeFile(path.join(project,"plugins","owned.ts"),"// LOCAL custom source");await writeFile(path.join(project,"plugins","base.json"),'"original BASE"');
  await runUpdateCommand(project,manager,["install","--ignore-scripts"]);
  const provider=new HttpCompatibilityReleaseProvider(`${url}/feed`),overview=new PackageUpdateService(provider,{root:tools,creatorVersion:"0.0.1"});
  return {root:project,provider,overview,service:new PackageUpgradeService(provider,overview),bad(){badIntegrity=true;},release};
}
it("installs the explicitly selected version beyond recommendations", async () => {
  const { root, service, release } = await setup("npm", false, ["0.0.1", "0.0.2", "0.0.3"]);
  Object.assign(release, { minimumCreatorVersion: "99.0.0", node: ">=99", react: ">=99" });
  const plan = await service.plan(root, { [name]: "0.0.3" });
  expect(plan.advisories?.some(issue => issue.code === "creator")).toBe(true);
  expect(await service.execute(root, plan.id)).toMatchObject({ status: "installed", checks: [] });
  expect(await readFile(path.join(root, "node_modules", name, "package.json"), "utf8")).toContain('"0.0.3"');
});
for (const manager of ["npm", "pnpm"] as const) it(`uses real ${manager} without project checks or automatic rollback`, async () => {
  const { root, provider, overview } = await setup(manager);
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as Record<string, unknown>;
  manifest.scripts = { typecheck: "exit 1", build: "exit 1", test: "exit 1" };
  await writeFile(path.join(root, "package.json"), JSON.stringify(manifest));
  const before = await readFile(path.join(root, "app-ui/composer.tsx"));
  const calls: string[][] = [];
  const service = new PackageUpgradeService(provider, overview, async (cwd, command, args) => {
    calls.push([command, ...args]);
    return runUpdateCommand(cwd, command, args);
  });
  const plan = await service.plan(root);
  expect(plan.checks).toEqual([]);
  expect(calls).toEqual([]);
  const stages: string[] = [];
  expect(await service.execute(root, plan.id, stage => stages.push(stage))).toMatchObject({ status: "installed" });
  expect(calls).toEqual([[manager, "install"]]);
  expect(stages).toEqual(["installing"]);
  expect(await readFile(path.join(root, "node_modules", name, "package.json"), "utf8")).toContain('"0.0.2"');
  expect(await readFile(path.join(root, "app-ui/composer.tsx"))).toEqual(before);
  expect(await service.recovery(root)).toBeNull();
});
it("accepts workspace, overrides, local declarations, duplicate fields and multiple/missing locks", async () => {
  const { root, provider, overview } = await setup();
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as Record<string, unknown>;
  Object.assign(manifest, { workspaces: ["*"], overrides: { unrelated: "1.0.0" }, resolutions: {},
    pnpm: { patchedDependencies: {} }, dependencies: { [name]: "file:../local" }, peerDependencies: { [name]: "*" } });
  await writeFile(path.join(root, "package.json"), JSON.stringify(manifest));
  await writeFile(path.join(root, "pnpm-workspace.yaml"), 'packages: ["."]');
  await writeFile(path.join(root, "yarn.lock"), "old lock");
  await rm(path.join(root, "package-lock.json"));
  const service = new PackageUpgradeService(provider, overview, async () => "");
  const plan = await service.plan(root, { [name]: "0.0.2" });
  expect(await service.execute(root, plan.id)).toMatchObject({ status: "installed" });
  const after = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as { dependencies: Record<string, string>; peerDependencies: Record<string, string>; overrides: unknown };
  expect(after.dependencies[name]).toBe("0.0.2");
  expect(after.peerDependencies[name]).toBe("0.0.2");
  expect(after.overrides).toEqual(manifest.overrides);
});
for (const manager of ["yarn", "bun"] as const) it(`uses the selected ${manager} without an admission gate`, async () => {
  const { root, provider, overview } = await setup();
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as Record<string, unknown>;
  manifest.packageManager = `${manager}@1.0.0`;
  await writeFile(path.join(root, "package.json"), JSON.stringify(manifest));
  const calls: string[][] = [];
  const service = new PackageUpgradeService(provider, overview, async (_cwd, command, args) => { calls.push([command, ...args]); return ""; });
  const plan = await service.plan(root);
  expect(await service.execute(root, plan.id)).toMatchObject({ status: "installed" });
  expect(calls).toEqual([[manager, "install"]]);
});
it("reports an actual install failure without rollback or blocking a new plan", async () => {
  const { root, provider, overview } = await setup();
  const calls: string[][] = [];
  const service = new PackageUpgradeService(provider, overview, async (_cwd, command, args) => { calls.push([command, ...args]); throw new Error("PACKAGE_COMMAND_FAILED"); });
  const plan = await service.plan(root);
  expect(await service.execute(root, plan.id)).toMatchObject({ status: "recovery-required", failure: "PACKAGE_COMMAND_FAILED" });
  expect(calls).toEqual([["npm", "install"]]);
  expect(await readFile(path.join(root, "package.json"), "utf8")).toContain('"0.0.2"');
  await expect(service.plan(root, { [name]: "0.0.2" })).resolves.toBeDefined();
  const restarted = new PackageUpgradeService(provider, overview);
  expect(await restarted.recover(root, plan.id)).toMatchObject({ status: "restored" });
});
it("does not inspect installed content, lock changes or unrelated source edits", async () => {
  const { root, provider, overview } = await setup();
  const service = new PackageUpgradeService(provider, overview, async () => "");
  const plan = await service.plan(root);
  await writeFile(path.join(root, "package-lock.json"), "changed by user");
  await writeFile(path.join(root, "app-ui/composer.tsx"), "// user edit");
  expect(await service.execute(root, plan.id)).toMatchObject({ status: "installed" });
  expect(await readFile(path.join(root, "package-lock.json"), "utf8")).toBe("changed by user");
  expect(await readFile(path.join(root, "app-ui/composer.tsx"), "utf8")).toBe("// user edit");
});
it("accepts an explicit tag when metadata discovery fails", async () => {
  const { root, provider, overview } = await setup();
  overview.inspect = async () => { throw new Error("registry unavailable"); };
  const service = new PackageUpgradeService(provider, overview, async () => "");
  const plan = await service.plan(root, { [name]: "next" });
  expect(plan.packages[0]?.target).toBe("next");
  expect(await service.execute(root, plan.id)).toMatchObject({ status: "installed" });
  expect(await readFile(path.join(root, "package.json"), "utf8")).toContain('"next"');
});
it("keeps confirmation tied to the project and manifest write", async () => {
  const { root, service } = await setup();
  await expect(service.execute(root, "invented")).rejects.toThrow("PACKAGE_PLAN_STALE");
  const plan = await service.plan(root);
  await writeFile(path.join(root, "package.json"), '{"name":"user-edit"}');
  await expect(service.execute(root, plan.id)).rejects.toThrow("PACKAGE_PLAN_STALE");
});
it("uses Windows package-manager helpers with inherited JS launchers", () => {
  for (const manager of ["npm", "pnpm", "yarn"]) expect(resourcePackageInvocation(manager, ["install"], "win32", {})).toEqual({ command: `${manager}.cmd`, args: ['"install"'], shell: true });
  expect(resourcePackageInvocation("bun", ["install"], "win32", {})).toEqual({ command: "bun", args: ["install"], shell: false });
  expect(resourcePackageInvocation("npm", ["install"], "win32", { npm_execpath: "C:\\tools\\npm-cli.js" })).toMatchObject({ command: process.execPath, shell: false });
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
 const plan=await service.plan(root);const installedResult=await service.execute(root,plan.id);expect(installedResult.failure).toBeUndefined();expect(installedResult).toMatchObject({status:"installed",checks:[]});
 expect(await readFile(appPath)).toEqual(application);expect(await readFile(source)).toEqual(local);expect(await readFile(ownershipPath)).toEqual(base);expect(await readFile(path.join(root,"src/ui/app-ui/app-ui.json"),"utf8")).toBe(model);
 const sync=await planPluginSourceSync(root,{pluginId:"composer"});expect(sync.package.version).toBe("0.0.2");
 await expect(syncPluginSource(root,{pluginId:"composer",planHash:sync.planHash},validate)).rejects.toMatchObject({code:"PLUGIN_SOURCE_MERGE_REQUIRED"});
 const target=Buffer.from(sync.mergeFiles.find(file=>file.path==="adapters/composer.tsx")!.target!,"base64").toString();
 await syncPluginSource(root,{pluginId:"composer",planHash:sync.planHash,resolutions:{"adapters/composer.tsx":target+"\n// kept local adapter customizations\n"}},validate);
 expect(await readFile(appPath)).toEqual(application);expect(await readFile(source,"utf8")).toContain("npmUpgradeFeature");expect(await readFile(source,"utf8")).toContain("kept local adapter customizations");expect(JSON.parse(await readFile(ownershipPath,"utf8")).plugins.composer.package.version).toBe("0.0.2");
},120000);
