import { OwnedPluginUpdateService } from "../owned-plugin-updates";
import { isPluginApplication } from "../plugin-application";
import { readPluginSourceOwnership } from "../plugin-source-ownership";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { comparePluginVersions, isAgentUISourceItemAvailable, InstalledUpdateSourceProvider, resolveAgentUISourceItemClosure, type UpdateSourceProvider, type ResolvedSourceRelease } from "../../source-catalog/index.js";
import { readAgentUIProjectConfig } from "../project-mode";
import { resolveAgentUIProjectPaths, operatorConfigForPaths } from "../agent-ui-project-paths";
import { inspectAgentUISources } from "./inspector";
import { readAgentUISourceLock, serializeAgentUISourceLock, sha256, readOptionalBuffer, AGENT_UI_SOURCE_TRANSACTION_FILE } from "./lock";
import { commitAgentUISourceUpgrade, recoverPendingAgentUISourceProjectMutation } from "./project-mutation";
import { assertNoSymbolicLinkTraversal, resolveAgentUISourceRoots } from "./path-policy";

import type { UpdateCompatibility, PluginUpdate, UpdateInspection, UpgradePlan } from "../../update-contract";
export type { UpdateCompatibility, PluginUpdate, UpdateInspection, UpgradePlan } from "../../update-contract";
interface StoredPlan { projectRoot: string; release: ResolvedSourceRelease; stateHash: string; plan: UpgradePlan; baselineHash: string; createdAt: number; mergeStarted: boolean }

/** Development Host owns provider, admission, authorization tokens and exact historical releases. */
export class AgentUIUpdateService {
  private readonly owned = new OwnedPluginUpdateService();
  private readonly plans = new Map<string, StoredPlan>();
  constructor(readonly provider: UpdateSourceProvider = new InstalledUpdateSourceProvider(), readonly creatorVersion?: string, readonly supportedContractVersion = 1) {}
  private compatibility(release: ResolvedSourceRelease): UpdateCompatibility {
    if (release.descriptor.contractVersion > this.supportedContractVersion || (release.descriptor.minimumCreatorVersion && (!this.creatorVersion || comparePluginVersions(this.creatorVersion, release.descriptor.minimumCreatorVersion) < 0))) return "creator-upgrade-required";
    if (release.descriptor.contractVersion !== this.supportedContractVersion) return "unsupported";
    return "compatible";
  }
  private async context(projectRoot: string, release: ResolvedSourceRelease, readOnly = false) {
    const project = await readAgentUIProjectConfig(projectRoot);
    const config = operatorConfigForPaths(resolveAgentUIProjectPaths(projectRoot, project.config));
    if (readOnly) {
      const paths = resolveAgentUIProjectPaths(projectRoot, project.config);
      for (const file of ["source-project-transaction.json", AGENT_UI_SOURCE_TRANSACTION_FILE]) {
        if (await readOptionalBuffer(path.join(paths.metadataRoot, file))) throw new Error("AGENT_UI_UPDATE_RECOVERY_REQUIRED");
      }
    } else await recoverPendingAgentUISourceProjectMutation(projectRoot, config);
    const inspection = await inspectAgentUISources(projectRoot, config, release.registry);
    const { lock } = await readAgentUISourceLock(projectRoot, config);
    const lockHash = sha256(serializeAgentUISourceLock(lock));
    return { config, inspection, lock, lockHash, stateHash: sha256(inspection.stateHash + serializeAgentUISourceLock(lock).toString()) };
  }
  async inspect(projectRoot: string, options?: { readOnly?: boolean }): Promise<UpdateInspection> {
    const latest = await this.provider.getLatestRelease();
    const release = await this.provider.resolveRelease(latest.releaseVersion);
    const { lock, inspection } = await this.context(projectRoot, release, options?.readOnly === true);
    const ownedPlugins = await this.owned.inspect(projectRoot);
    const ownedIds = new Set(ownedPlugins.map(plugin=>plugin.pluginId));
    const plugins: PluginUpdate[] = [...ownedPlugins];
const projectPaths = await resolveAgentUISourceRoots(projectRoot, operatorConfigForPaths(resolveAgentUIProjectPaths(projectRoot, (await readAgentUIProjectConfig(projectRoot)).config)));
    for (const [id, target] of Object.entries(release.descriptor.plugins).sort()) {
      if (ownedIds.has(id)) continue;
      if (await isPluginApplication(path.join(projectPaths.sourceRoot,"plugins",id),id)) continue;
      const locked = lock.items[`plugin/${id}`];
      if (!locked) continue;
      const currentVersion = locked.pluginVersion ?? null;
      const manifest = release.registry.byId.get(`plugin/${id}`)!.loadedFiles.find(file => file.target === `plugins/${id}/manifest.json`)!;
      // Legacy locks have no trustworthy release provenance. Surface recovery instead of guessing BASE.
      const updateAvailable = currentVersion === null || comparePluginVersions(target.version, currentVersion) > 0;
      plugins.push({ pluginId: id, name: JSON.parse(manifest.content.toString()).name ?? id, currentVersion, targetVersion: target.version, sourceRelease: locked.sourceRelease ?? null,
        status: inspection.items.find(item => item.id === `plugin/${id}`)!.status, updateAvailable,
        changelog: Object.entries(release.changelogs[id] ?? {}).filter(([version]) => (!currentVersion || comparePluginVersions(version, currentVersion) > 0) && comparePluginVersions(version, target.version) <= 0)
          .sort(([a], [b]) => comparePluginVersions(a, b)).map(([version, entry]) => ({ version, entry })) });
    }
    return { releaseVersion: latest.releaseVersion, compatibility: this.compatibility(release), plugins,
      fingerprint: sha256(plugins.filter(plugin => plugin.updateAvailable).map(plugin => `${plugin.pluginId}@${plugin.targetVersion}:${plugin.packageVersion ?? ""}`).sort().join("\n")) };
  }
  async plan(projectRoot: string, pluginIds: string[], releaseVersion: string): Promise<UpgradePlan> {
    if (!pluginIds.length || new Set(pluginIds).size !== pluginIds.length) throw new Error("请选择要更新的插件。");
    const project = await readAgentUIProjectConfig(projectRoot);
    const owner = await readPluginSourceOwnership(resolveAgentUIProjectPaths(projectRoot,project.config).metadataRoot);
    if (pluginIds.some(id=>owner.plugins[id]?.implementationRoot === "source")) {
      if(pluginIds.length!==1) throw new Error("PLUGIN_SOURCE_SYNC_ONE_AT_A_TIME");
      return this.owned.plan(projectRoot,pluginIds[0]!,releaseVersion);
    }
    const release = await this.provider.resolveRelease(releaseVersion);
    const ctx = await this.context(projectRoot, release);
    const ownership = await readPluginSourceOwnership((await resolveAgentUISourceRoots(projectRoot, ctx.config)).metadataRoot);
    const sourcePaths = await resolveAgentUISourceRoots(projectRoot, ctx.config);
    for (const id of pluginIds) if (await isPluginApplication(path.join(sourcePaths.sourceRoot, "plugins", id), id)) throw new Error("PLUGIN_APPLICATION_USE_PACKAGE_OR_EXPLICIT_SYNC");
    if (pluginIds.some(id => ownership.plugins[id])) throw new Error("SOURCE_OWNED_PLUGIN_USE_EXPLICIT_SYNC: use the implementation-only source sync plan.");
    const closure = new Map(pluginIds.flatMap(id => {
      const locked = ctx.lock.items[`plugin/${id}`];
      const target = release.descriptor.plugins[id];
      if (!locked || !target || (locked.pluginVersion && comparePluginVersions(target.version, locked.pluginVersion) <= 0)) throw new Error("插件没有可用升级。");
      return resolveAgentUISourceItemClosure(release.registry, `plugin/${id}`).map(item => [item.id, item] as const);
    }));
    const issues: string[] = [];
    const items = [...closure.values()].map(item => {
      const inspected = ctx.inspection.items.find(entry => entry.id === item.id)!;
      if (!isAgentUISourceItemAvailable(item.id)) issues.push(`AGENT_UI_RESOURCE_DISABLED: ${item.id}`);
      const locked = ctx.lock.items[item.id];
      const provided = ctx.config.agentUI.providedSourceItems?.includes(item.id) ?? false;
      if (locked?.sourceRelease && comparePluginVersions(releaseVersion, locked.sourceRelease) < 0) issues.push(`AGENT_UI_UPDATE_RELEASE_REGRESSION: ${item.id}: 目标 Release ${releaseVersion} 低于当前基线 ${locked.sourceRelease}，禁止降级`);
      const targetPluginVersion = item.id.startsWith("plugin/") ? release.descriptor.plugins[item.id.slice(7)]!.version : null;
      if (locked?.pluginVersion && targetPluginVersion && comparePluginVersions(targetPluginVersion, locked.pluginVersion) < 0) issues.push(`${item.id}: 目标依赖版本低于项目当前基线，禁止降级`);
      // A shared dependency with no content change must keep its existing baseline.
      const changed = provided ? inspected.status !== "managed" : inspected.updateAvailable || !locked;
      if (inspected.resolvedRequirements.some(requirement => !requirement.compatible)) issues.push(`${item.id}: 依赖包未安装或版本不兼容`);
      if (["blocked", "partial"].includes(inspected.status)) issues.push(`${item.id}: ${inspected.status}`);
      if (provided && changed) issues.push(`${item.id}: Host 提供的基础依赖无法通过插件更新修改`);
      const paths = [...new Set([...item.loadedFiles.filter(file => locked?.files[file.target]?.sha256 !== sha256(file.content)).map(file => file.target), ...Object.keys(locked?.files ?? {}).filter(target => !item.loadedFiles.some(file => file.target === target))])].sort();
      return { itemId: item.id,
        reason: pluginIds.includes(item.id.replace(/^plugin\//, "")) ? "requested" as const : "dependency" as const,
        requiredBy: pluginIds.filter(id => resolveAgentUISourceItemClosure(release.registry, `plugin/${id}`).some(dependency => dependency.id === item.id)),
        status: inspected.status, changed, provided, currentVersion: locked?.pluginVersion ?? null,
        targetVersion: targetPluginVersion, paths };
    });
    const compatibility = this.compatibility(release);
    const plan: UpgradePlan = { id: randomUUID(), releaseVersion, compatibility, requestedPlugins: [...pluginIds], items,
      fileCount: new Set(items.flatMap(item => item.paths)).size, requiresMerge: items.some(item => item.changed && item.status === "customized"), blocked: issues.length > 0 || compatibility !== "compatible", issues };
    for (const [id, stored] of this.plans) if (Date.now() - stored.createdAt > 3600000) this.plans.delete(id);
    this.plans.set(plan.id, { projectRoot: path.resolve(projectRoot), release, stateHash: ctx.stateHash, baselineHash: ctx.lockHash, plan, createdAt: Date.now(), mergeStarted: false });
    return plan;
  }
  private stored(projectRoot: string, id: string) {
    const stored = this.plans.get(id);
    if (!stored || stored.projectRoot !== path.resolve(projectRoot) || Date.now() - stored.createdAt > 3600000) throw new Error("升级计划已过期，请重新生成。");
    if (stored.plan.blocked) throw new Error("此升级计划不兼容或包含阻塞项。");
    return stored;
  }
  async execute(projectRoot: string, planId: string) {
    if(this.owned.has(planId)) return this.owned.execute(projectRoot,planId);
    const stored = this.stored(projectRoot, planId);
    if (stored.plan.requiresMerge) throw new Error("此升级需要合并本地修改，禁止直接覆盖。");
    const result = await commitAgentUISourceUpgrade(projectRoot, { registry: stored.release.registry, itemIds: stored.plan.items.filter(item => item.changed && !item.provided).map(item => item.itemId), expectedStateHash: stored.stateHash });
    this.plans.delete(planId);
    return result;
  }
  async merge(projectRoot: string, planId: string) {
    if(this.owned.has(planId)) return this.owned.merge(projectRoot,planId);
    const stored = this.stored(projectRoot, planId);
    const ctx = await this.context(projectRoot, stored.release);
    if (ctx.stateHash !== stored.stateHash) throw new Error("源码已改变，请重新生成升级计划。");
    const { sourceRoot } = await resolveAgentUISourceRoots(projectRoot, ctx.config);
    const files: { itemId: string; path: string; base: string | null; local: string | null; target: string | null }[] = [];
    for (const entry of stored.plan.items.filter(item => item.changed && !item.provided)) {
      const locked = ctx.lock.items[entry.itemId];
      if (!locked?.sourceRelease && entry.status === "customized") throw new Error(`${entry.itemId} 缺少历史 Release，无法构建 BASE；请手动合并。`);
      const historical = locked?.sourceRelease ? await this.provider.resolveRelease(locked.sourceRelease) : undefined;
      const base = historical?.registry.byId.get(entry.itemId);
      const baselineVersionMatches = !entry.itemId.startsWith("plugin/") || historical?.descriptor.plugins[entry.itemId.slice(7)]?.version === locked?.pluginVersion;
      if (locked?.sourceRelease && (!baselineVersionMatches || !base || base.loadedFiles.some(file => locked.files[file.target]?.sha256 !== sha256(file.content)) || Object.keys(locked.files).length !== base.loadedFiles.length)) throw new Error("历史 Release 与 source-lock 基线不一致。");
      const target = stored.release.registry.byId.get(entry.itemId)!;
      for (const relative of [...new Set([...Object.keys(locked?.files ?? {}), ...target.loadedFiles.map(file => file.target)])].sort()) {
        await assertNoSymbolicLinkTraversal(sourceRoot, relative);
        files.push({ itemId: entry.itemId, path: path.posix.join(ctx.config.agentUI.sourceRoot, relative), base: base?.loadedFiles.find(file => file.target === relative)?.content.toString() ?? null,
          local: (await readOptionalBuffer(path.join(sourceRoot, relative)))?.toString() ?? null, target: target.loadedFiles.find(file => file.target === relative)?.content.toString() ?? null });
      }
    }
    stored.mergeStarted = true;
    return { planId, files, prompt: `用户已选择模型合并插件升级至 Source Release ${stored.plan.releaseVersion}。下面是 Host 解析的 BASE / LOCAL / TARGET。保留 LOCAL 用户改动并吸收 TARGET 更新；null 表示文件不存在。只编辑所列源码，禁止修改 source-lock 或自行推进基线。完成后运行 validate_creator_changes，并说明结果。基线由用户在更新页确认后交给 Host 验证和推进。\n${JSON.stringify(files)}` };
  }
  async startManualMerge(projectRoot: string, planId: string) {
    if(this.owned.has(planId)) { const result=await this.owned.merge(projectRoot,planId); return {planId,files:result.files.map(file=>file.path)}; }
    const stored = this.stored(projectRoot, planId);
    const ctx = await this.context(projectRoot, stored.release);
    if (ctx.stateHash !== stored.stateHash) throw new Error("源码已改变，请重新生成计划。");
    stored.mergeStarted = true;
    return { planId, files: stored.plan.items.flatMap(item => item.paths) };
  }
  async adopt(projectRoot: string, planId: string) {
    if(this.owned.has(planId)) return this.owned.adopt(projectRoot,planId);
    const stored = this.stored(projectRoot, planId);
    if (!stored.mergeStarted) throw new Error("请先选择并完成合并。");
    const ctx = await this.context(projectRoot, stored.release);
    if (ctx.lockHash !== stored.baselineHash) throw new Error("升级基线已改变，请重新生成计划。");
    const result = await commitAgentUISourceUpgrade(projectRoot, { registry: stored.release.registry, itemIds: stored.plan.items.filter(item => item.changed && !item.provided).map(item => item.itemId), expectedStateHash: ctx.stateHash, adoptOnly: true });
    this.plans.delete(planId);
    return result;
  }
}
