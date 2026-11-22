import { createRequire } from "node:module";
import { comparePluginVersions, type ChangelogEntry } from "../source-catalog/index.js";
import { assertSafeProjectRelativePath, assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { resourcePaths } from "./optional-resource-paths";
import { readPluginSourceOwnership } from "./plugin-source-ownership";
import { currentPluginVersion } from "./current-plugin-source";
import { planPluginSourceSync, syncPluginSource, preparePluginSourceSyncDependencies } from "./takeover-plugin-source";
import type { ResourcePackageRunner } from "./ensure-resource-packages";
import type { UpgradePlan, PluginUpdate } from "../update-contract";

type Snapshot = Awaited<ReturnType<typeof planPluginSourceSync>>;
type Stored = { root: string; snapshot: Snapshot; guard: string; ownershipHash: string; createdAt: number; merging: boolean; plan: UpgradePlan };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const changed = (snapshot: Snapshot) => snapshot.mergeFiles.filter(file => file.local !== file.target);
const needsReview = (file: Snapshot["mergeFiles"][number]) => file.local !== null && file.local !== file.target;
const text = (value: string | null) => value === null ? null : Buffer.from(value, "base64").toString("utf8");

/** Keep all application/config files protected while allowing implementation edits. */
async function guard(root: string, id: string) {
  const { paths } = await resourcePaths(root);
  const digest = createHash("sha256");
  async function walk(relative: string) {
    for (const entry of (await readdir(path.join(paths.sourceRoot, ...relative.split("/")), {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (file === `plugins/${id}/source` || path.join(paths.sourceRoot, ...file.split("/")) === paths.generatedPluginRegistryPath) continue;
      if (entry.isSymbolicLink()) throw new Error("PLUGIN_SYNC_PROTECTED_SYMLINK");
      if (entry.isDirectory()) await walk(file);
      else digest.update(file + "\0").update(await readFile(path.join(paths.sourceRoot, ...file.split("/"))));
    }
  }
  await walk("");
  for (const file of [paths.sourceLockPath, path.join(paths.metadataRoot,"project.json"), ...["package.json","pnpm-lock.yaml","package-lock.json","yarn.lock"].map(file=>path.join(root,file))]) {
    digest.update(file + "\0").update(await readFile(file).catch(error=>{if(error.code==="ENOENT")return Buffer.from("<missing>");throw error;}));
  }
  return digest.digest("hex");
}

/** UI plans reference the target project's exact installed package, never tool dependencies. */
export class OwnedPluginUpdateService {
  private plans = new Map<string, Stored>();
  constructor(private readonly run?: ResourcePackageRunner) {}
  async inspect(root: string): Promise<PluginUpdate[]> {
    const { paths } = await resourcePaths(root);
    const ownership = await readPluginSourceOwnership(paths.metadataRoot);
    const result: PluginUpdate[] = [];
    for (const [id, owner] of Object.entries(ownership.plugins)) {
      if (owner.implementationRoot !== "source") continue;
      const snapshot = await planPluginSourceSync(root,{pluginId:id});
      const manifest = snapshot.mergeFiles.find(file=>file.path==="manifest.json")!;
      const catalogPath=createRequire(path.join(root,"package.json")).resolve("@za38.03/agent-ui-plugins/catalog.json");
      const catalog=JSON.parse(await readFile(catalogPath,"utf8"));
      const changelogFile=catalog.plugins.find((plugin:{id:string})=>plugin.id===id)?.files.find((file:{path:string})=>file.path===`sources/plugins/${id}/CHANGELOG.json`);
      let changelog: PluginUpdate["changelog"]=[];
      if(changelogFile){
        assertSafeProjectRelativePath(changelogFile.path,"Plugin changelog");
        await assertNoSymbolicLinkTraversal(path.dirname(catalogPath),changelogFile.path);
        const bytes=await readFile(path.join(path.dirname(catalogPath),...changelogFile.path.split("/")));
        if(hash(bytes.toString())!==changelogFile.sha256)throw new Error("PLUGIN_SOURCE_CHANGELOG_INTEGRITY");
        changelog=Object.entries(JSON.parse(bytes.toString()) as Record<string,ChangelogEntry>).filter(([version])=>comparePluginVersions(version,snapshot.pluginVersion)<=0).sort(([a],[b])=>comparePluginVersions(b,a)).map(([version,entry])=>({version,entry}));
      }
      const currentVersion = currentPluginVersion(manifest.local === null ? undefined : Buffer.from(manifest.local, "base64"));
      const newerTarget = currentVersion === null || comparePluginVersions(snapshot.pluginVersion, currentVersion) > 0
        || comparePluginVersions(snapshot.package.version, owner.package.version) > 0;
      const currentIsNewer = currentVersion !== null && comparePluginVersions(currentVersion, snapshot.pluginVersion) > 0;
      result.push({pluginId:id,name:JSON.parse(text(manifest.target)!).name,currentVersion,targetVersion:snapshot.pluginVersion,
        sourceRelease:null,status:"managed",
        updateAvailable:!currentIsNewer && newerTarget && changed(snapshot).some(file => file.target !== null),delivery:"source-owned",packageVersion:snapshot.package.version,
        changelog});
    }
    return result;
  }
  async plan(root: string, id: string, releaseVersion: string): Promise<UpgradePlan> {
    const {paths}=await resourcePaths(root);
    const ownership=await readPluginSourceOwnership(paths.metadataRoot);
    const snapshot=await planPluginSourceSync(root,{pluginId:id});
    const files=changed(snapshot);
    if(!files.length)throw new Error("PLUGIN_SOURCE_NO_UPDATE");
    const plan: UpgradePlan={id:randomUUID(),kind:"owned-source",releaseVersion,compatibility:"compatible",requestedPlugins:[id],
      items:[{itemId:`plugin/${id}`,reason:"requested",requiredBy:[id],status:"managed",changed:true,provided:false,
        currentVersion:currentPluginVersion(Buffer.from(snapshot.mergeFiles.find(file=>file.path==="manifest.json")?.local ?? "", "base64")),targetVersion:snapshot.pluginVersion,paths:files.map(file=>`plugins/${id}/source/${file.path}`)}],
      fileCount:files.length,requiresMerge:files.some(needsReview),blocked:false,issues:[],dependencyChanges:snapshot.dependencyChanges,
      recommendations:snapshot.recommendations.map(({api,required,installed})=>`${api}: ${installed??"?"} → ${required}`)};
    for(const [key,value] of this.plans)if(Date.now()-value.createdAt>3600000)this.plans.delete(key);
    this.plans.set(plan.id,{root:path.resolve(root),snapshot,guard:await guard(root,id),ownershipHash:hash(JSON.stringify(ownership.plugins[id])),createdAt:Date.now(),merging:false,plan});
    return plan;
  }
  has(id:string){return this.plans.has(id);}
  private stored(root:string,id:string){const value=this.plans.get(id);if(!value||value.root!==path.resolve(root)||Date.now()-value.createdAt>3600000)throw new Error("PLUGIN_SOURCE_PLAN_EXPIRED");return value;}
  async merge(root:string,id:string){
    const stored=this.stored(root,id), pluginId=stored.snapshot.pluginId;
    let fresh=await planPluginSourceSync(root,{pluginId});
    if(fresh.planHash!==stored.snapshot.planHash)throw new Error("PLUGIN_SOURCE_PLAN_STALE");
    if (fresh.dependencyChanges.length) {
      await preparePluginSourceSyncDependencies(root, { pluginId, planHash: fresh.planHash }, this.run);
      fresh = await planPluginSourceSync(root, { pluginId });
      stored.snapshot = fresh;
      stored.guard = await guard(root, pluginId);
    }
    const {config}=await resourcePaths(root);
    const files=stored.snapshot.mergeFiles.map(file=>({itemId:`plugin/${pluginId}`,path:path.posix.join(config.agentUI.sourceRoot,`plugins/${pluginId}/source/${file.path}`),local:text(file.local),target:text(file.target)}));
    stored.merging=true;
    return {planId:id,files,prompt:`用户已在 Creator 更新页选择合并 ${pluginId} 的实现源码，目标 npm 包版本 ${fresh.package.version}。当前项目代码是事实来源，包括用户和其他 Agent 的修改；没有历史基线，也不能推断哪些内容是未修改的官方原版。只编辑下列 source/ 实现文件，结合当前实现和目标新版准备用户需要的更新，保留现有结构、样式、交互和项目专有文件；不能为了匹配目标而直接重置当前文件。目标不存在的项目文件默认保留，是否删除需要根据具体更新说明和现有引用判断。不要编辑应用层 index.tsx/definition.ts、AppUIModel 或 ownership。null 表示文件不存在。无需再次询问接管。无法判断用户期望时询问用户。提示用户自行检查结果和预览；工程验证不作为完成同步的门槛。用户在更新页确认后完成同步。最终回复使用当前会话语言，说明更新了什么、保留了什么，以及需要回到更新页确认完成同步。\n${JSON.stringify(files.filter(file=>file.local!==file.target))}`};
  }
  async execute(root:string,id:string){const stored=this.stored(root,id);if(stored.plan.requiresMerge)throw new Error("PLUGIN_SOURCE_MERGE_REQUIRED");return this.apply(root,id,false);}
  async adopt(root:string,id:string){const stored=this.stored(root,id);if(!stored.merging)throw new Error("PLUGIN_SOURCE_MERGE_NOT_STARTED");return this.apply(root,id,true);}
  private async apply(root:string,id:string,adopt:boolean){
    const stored=this.stored(root,id),pluginId=stored.snapshot.pluginId;
    const {paths}=await resourcePaths(root);
    const ownership=await readPluginSourceOwnership(paths.metadataRoot);
    if(hash(JSON.stringify(ownership.plugins[pluginId]))!==stored.ownershipHash||await guard(root,pluginId)!==stored.guard)throw new Error("PLUGIN_SOURCE_PROTECTED_FILES_CHANGED");
    const fresh=await planPluginSourceSync(root,{pluginId});
    if(fresh.catalogHash!==stored.snapshot.catalogHash)throw new Error("PLUGIN_SOURCE_TARGET_CHANGED");
    const resolutions:Record<string,string|null>={};
    if(adopt)for(const file of fresh.mergeFiles){
      // Confirmation accepts the actual edited result, including an explicit
      // decision to retain a file unchanged or omit a target file.
      if(file.local!==file.target)resolutions[file.path]=text(file.local);
    }
    else if(fresh.planHash!==stored.snapshot.planHash)throw new Error("PLUGIN_SOURCE_PLAN_STALE");
    await syncPluginSource(root,{pluginId,planHash:fresh.planHash,resolutions},this.run);
    this.plans.delete(id);
    return {updatedItems:[`plugin/${pluginId}`],adopted:adopt};
  }
}
