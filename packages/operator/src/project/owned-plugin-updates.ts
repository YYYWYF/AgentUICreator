import { createRequire } from "node:module";
import { comparePluginVersions, type ChangelogEntry } from "../source-catalog/index.js";
import { assertSafeProjectRelativePath, assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { resourcePaths } from "./optional-resource-paths";
import { readPluginSourceOwnership } from "./plugin-source-ownership";
import { planPluginSourceSync, syncPluginSource } from "./takeover-plugin-source";
import type { ResourcePackageRunner } from "./ensure-resource-packages";
import type { UpgradePlan, PluginUpdate } from "../update-contract";

type Snapshot = Awaited<ReturnType<typeof planPluginSourceSync>>;
type Stored = { root: string; snapshot: Snapshot; guard: string; baseline: string; createdAt: number; merging: boolean; plan: UpgradePlan };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const changed = (snapshot: Snapshot) => snapshot.mergeFiles.filter(file => file.base !== file.target);
const conflict = (file: Snapshot["mergeFiles"][number]) => file.local !== file.base && file.target !== file.base && file.local !== file.target;
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
        changelog=Object.entries(JSON.parse(bytes.toString()) as Record<string,ChangelogEntry>).filter(([version])=>comparePluginVersions(version,owner.pluginVersion)>0&&comparePluginVersions(version,snapshot.pluginVersion)<=0).map(([version,entry])=>({version,entry}));
      }
      result.push({pluginId:id,name:JSON.parse(text(manifest.target)!).name,currentVersion:owner.pluginVersion,targetVersion:snapshot.pluginVersion,
        sourceRelease:null,status:snapshot.mergeFiles.some(file=>file.local!==file.base)?"customized":"managed",
        updateAvailable:changed(snapshot).length>0,delivery:"source-owned",packageVersion:snapshot.package.version,
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
      items:[{itemId:`plugin/${id}`,reason:"requested",requiredBy:[id],status:snapshot.mergeFiles.some(file=>file.local!==file.base)?"customized":"managed",changed:true,provided:false,
        currentVersion:ownership.plugins[id]!.pluginVersion,targetVersion:snapshot.pluginVersion,paths:files.map(file=>`plugins/${id}/source/${file.path}`)}],
      fileCount:files.length,requiresMerge:files.some(conflict),blocked:false,issues:[]};
    for(const [key,value] of this.plans)if(Date.now()-value.createdAt>3600000)this.plans.delete(key);
    this.plans.set(plan.id,{root:path.resolve(root),snapshot,guard:await guard(root,id),baseline:hash(JSON.stringify(ownership.plugins[id])),createdAt:Date.now(),merging:false,plan});
    return plan;
  }
  has(id:string){return this.plans.has(id);}
  private stored(root:string,id:string){const value=this.plans.get(id);if(!value||value.root!==path.resolve(root)||Date.now()-value.createdAt>3600000)throw new Error("PLUGIN_SOURCE_PLAN_EXPIRED");return value;}
  async merge(root:string,id:string){
    const stored=this.stored(root,id), pluginId=stored.snapshot.pluginId;
    const fresh=await planPluginSourceSync(root,{pluginId});
    if(fresh.planHash!==stored.snapshot.planHash)throw new Error("PLUGIN_SOURCE_PLAN_STALE");
    const {config}=await resourcePaths(root);
    const files=stored.snapshot.mergeFiles.map(file=>({itemId:`plugin/${pluginId}`,path:path.posix.join(config.agentUI.sourceRoot,`plugins/${pluginId}/source/${file.path}`),base:text(file.base),local:text(file.local),target:text(file.target)}));
    stored.merging=true;
    return {planId:id,files,prompt:`用户已在 Creator 更新页选择合并 ${pluginId} 的实现源码，目标 npm 包版本 ${fresh.package.version}。只编辑下列 source/ 实现文件，保留 LOCAL 定制并吸收 TARGET；不要编辑应用层 index.tsx/definition.ts、AppUIModel、ownership 或 BASE。null 表示不存在。无需再次询问接管。工具已确认以下文件存在用户定制，不能把它们当成未修改的原版：${JSON.stringify(files.filter(file=>file.local!==file.base).map(file=>file.path))}。先对比 BASE 与 LOCAL，识别并保留这些定制，再吸收 TARGET 的更新。结构与节点顺序、样式和交互上的本地差异同样属于定制，不要为匹配 TARGET 而恢复原始布局；完成前再次核对这些定制在合并结果中仍然存在，无法判断时询问用户，不能默认舍弃。运行 validate_creator_changes 并确认预览。用户在更新页检查合并结果并确认，通过工程验证后才能完成源码同步；模型不得自行推进基线。面向用户的最终说明请使用当前会话语言，最终回复控制在三句：更新了什么；保留了哪些定制；需要用户回到更新页验证并完成同步。最终说明不要列出文件路径、BASE/LOCAL/TARGET、ownership 或基线等实现术语；内部分析和工具调用仍可使用这些信息。\n${JSON.stringify(files.filter(file=>file.base!==file.target||file.base!==file.local))}`};
  }
  async execute(root:string,id:string){const stored=this.stored(root,id);if(stored.plan.requiresMerge)throw new Error("PLUGIN_SOURCE_MERGE_REQUIRED");return this.apply(root,id,false);}
  async adopt(root:string,id:string){const stored=this.stored(root,id);if(!stored.merging)throw new Error("PLUGIN_SOURCE_MERGE_NOT_STARTED");return this.apply(root,id,true);}
  private async apply(root:string,id:string,adopt:boolean){
    const stored=this.stored(root,id),pluginId=stored.snapshot.pluginId;
    const {paths}=await resourcePaths(root);
    const ownership=await readPluginSourceOwnership(paths.metadataRoot);
    if(hash(JSON.stringify(ownership.plugins[pluginId]))!==stored.baseline||await guard(root,pluginId)!==stored.guard)throw new Error("PLUGIN_SOURCE_PROTECTED_FILES_CHANGED");
    const fresh=await planPluginSourceSync(root,{pluginId});
    if(fresh.catalogHash!==stored.snapshot.catalogHash)throw new Error("PLUGIN_SOURCE_TARGET_CHANGED");
    const resolutions:Record<string,string|null>={};
    if(adopt)for(const file of fresh.mergeFiles){
      const original=stored.snapshot.mergeFiles.find(entry=>entry.path===file.path);
      if(original&&conflict(original)&&file.local===original.local)throw new Error("PLUGIN_SOURCE_MERGE_UNRESOLVED");
      if(file.local!==file.base&&file.local!==file.target&&file.target!==file.base)resolutions[file.path]=text(file.local);
    }
    else if(fresh.planHash!==stored.snapshot.planHash)throw new Error("PLUGIN_SOURCE_PLAN_STALE");
    await syncPluginSource(root,{pluginId,planHash:fresh.planHash,resolutions},this.run);
    this.plans.delete(id);
    return {updatedItems:[`plugin/${pluginId}`],adopted:adopt};
  }
}
