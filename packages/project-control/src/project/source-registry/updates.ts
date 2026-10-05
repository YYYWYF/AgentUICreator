import { randomUUID } from "node:crypto";
import path from "node:path";
import { comparePluginVersions, MockUpdateSourceProvider, resolveAgentUISourceItemClosure, type UpdateSourceProvider, type ResolvedSourceRelease } from "@agent-ui/source-registry";
import { readAgentUIProjectConfig } from "../project-mode";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths } from "../agent-ui-project-paths";
import { inspectAgentUISources } from "./inspector";
import { readAgentUISourceLock, serializeAgentUISourceLock, sha256, readOptionalBuffer } from "./lock";
import { commitAgentUISourceUpgrade, recoverPendingAgentUISourceProjectMutation } from "./project-mutation";
import { assertNoSymbolicLinkTraversal, resolveAgentUISourceRoots } from "./path-policy";

import type { UpdateCompatibility, PluginUpdate, UpdateInspection, UpgradePlan } from "../../update-contract";
export type { UpdateCompatibility, PluginUpdate, UpdateInspection, UpgradePlan } from "../../update-contract";
interface StoredPlan { projectRoot: string; release: ResolvedSourceRelease; stateHash: string; plan: UpgradePlan; baselineHash: string; createdAt: number; mergeStarted: boolean }

/** Development Host owns provider, admission, authorization tokens and exact historical releases. */
export class AgentUIUpdateService {
  private readonly plans = new Map<string, StoredPlan>();
  constructor(readonly provider: UpdateSourceProvider = new MockUpdateSourceProvider(), readonly creatorVersion = "0.1.0", readonly supportedContractVersion = 1) {}
  private compatibility(release: ResolvedSourceRelease): UpdateCompatibility {
    if (release.descriptor.contractVersion > this.supportedContractVersion || (release.descriptor.minimumCreatorVersion && comparePluginVersions(this.creatorVersion, release.descriptor.minimumCreatorVersion) < 0)) return "creator-upgrade-required";
    if (release.descriptor.contractVersion !== this.supportedContractVersion) return "unsupported";
    return "compatible";
  }
  private async context(projectRoot: string, release: ResolvedSourceRelease) {
    const project = await readAgentUIProjectConfig(projectRoot);
    const config = projectControlConfigForPaths(resolveAgentUIProjectPaths(projectRoot, project.config));
    await recoverPendingAgentUISourceProjectMutation(projectRoot, config);
    const inspection = await inspectAgentUISources(projectRoot, config, release.registry);
    const { lock } = await readAgentUISourceLock(projectRoot, config);
    const lockHash = sha256(serializeAgentUISourceLock(lock));
    return { config, inspection, lock, lockHash, stateHash: sha256(inspection.stateHash + serializeAgentUISourceLock(lock).toString()) };
  }
  async inspect(projectRoot: string): Promise<UpdateInspection> {
    const latest = await this.provider.getLatestRelease();
    const release = await this.provider.resolveRelease(latest.releaseVersion);
    const { lock, inspection } = await this.context(projectRoot, release);
    const plugins: PluginUpdate[] = [];
    for (const [id, target] of Object.entries(release.descriptor.plugins).sort()) {
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
      fingerprint: sha256(plugins.filter(plugin => plugin.updateAvailable).map(plugin => `${plugin.pluginId}@${plugin.targetVersion}`).sort().join("\n")) };
  }
  async plan(projectRoot: string, pluginIds: string[], releaseVersion: string): Promise<UpgradePlan> {
    if (!pluginIds.length || new Set(pluginIds).size !== pluginIds.length) throw new Error("请选择要更新的插件。");
    const release = await this.provider.resolveRelease(releaseVersion);
    const ctx = await this.context(projectRoot, release);
    const closure = new Map(pluginIds.flatMap(id => {
      const locked = ctx.lock.items[`plugin/${id}`];
      const target = release.descriptor.plugins[id];
      if (!locked || !target || (locked.pluginVersion && comparePluginVersions(target.version, locked.pluginVersion) <= 0)) throw new Error("插件没有可用升级。");
      return resolveAgentUISourceItemClosure(release.registry, `plugin/${id}`).map(item => [item.id, item] as const);
    }));
    const issues: string[] = [];
    const items = [...closure.values()].map(item => {
      const inspected = ctx.inspection.items.find(entry => entry.id === item.id)!;
      const locked = ctx.lock.items[item.id];
      const provided = ctx.config.agentUI.providedSourceItems?.includes(item.id) ?? false;
      const targetPluginVersion = item.id.startsWith("plugin/") ? release.descriptor.plugins[item.id.slice(7)]!.version : null;
      if (locked?.pluginVersion && targetPluginVersion && comparePluginVersions(targetPluginVersion, locked.pluginVersion) < 0) issues.push(`${item.id}: 目标依赖版本低于项目当前基线，禁止降级`);
      const changed = provided ? inspected.status !== "managed" : inspected.updateAvailable || !locked;
      if (inspected.resolvedRequirements.some(requirement => !requirement.compatible)) issues.push(`${item.id}: 依赖包未安装或版本不兼容`);
      if (["blocked", "partial"].includes(inspected.status)) issues.push(`${item.id}: ${inspected.status}`);
      if (provided && changed) issues.push(`${item.id}: Host 提供的基础依赖无法通过插件更新修改`);
      const paths = [...new Set([...item.loadedFiles.filter(file => locked?.files[file.target]?.sha256 !== sha256(file.content)).map(file => file.target), ...Object.keys(locked?.files ?? {}).filter(target => !item.loadedFiles.some(file => file.target === target))])].sort();
      return { itemId: item.id, status: inspected.status, changed, provided, currentVersion: locked?.pluginVersion ?? null,
        targetVersion: targetPluginVersion, paths };
    });
    const compatibility = this.compatibility(release);
    const plan: UpgradePlan = { id: randomUUID(), releaseVersion, compatibility, requestedPlugins: pluginIds, items,
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
    const stored = this.stored(projectRoot, planId);
    if (stored.plan.requiresMerge) throw new Error("此升级需要合并本地修改，禁止直接覆盖。");
    const result = await commitAgentUISourceUpgrade(projectRoot, { registry: stored.release.registry, itemIds: stored.plan.items.filter(item => item.changed && !item.provided).map(item => item.itemId), expectedStateHash: stored.stateHash });
    this.plans.delete(planId);
    return result;
  }
  async merge(projectRoot: string, planId: string) {
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
    const stored = this.stored(projectRoot, planId);
    const ctx = await this.context(projectRoot, stored.release);
    if (ctx.stateHash !== stored.stateHash) throw new Error("源码已改变，请重新生成计划。");
    stored.mergeStarted = true;
    return { planId, files: stored.plan.items.flatMap(item => item.paths) };
  }
  async adopt(projectRoot: string, planId: string) {
    const stored = this.stored(projectRoot, planId);
    if (!stored.mergeStarted) throw new Error("请先选择并完成合并。");
    const ctx = await this.context(projectRoot, stored.release);
    if (ctx.lockHash !== stored.baselineHash) throw new Error("升级基线已改变，请重新生成计划。");
    const result = await commitAgentUISourceUpgrade(projectRoot, { registry: stored.release.registry, itemIds: stored.plan.items.filter(item => item.changed && !item.provided).map(item => item.itemId), expectedStateHash: ctx.stateHash, adoptOnly: true });
    this.plans.delete(planId);
    return result;
  }
}
