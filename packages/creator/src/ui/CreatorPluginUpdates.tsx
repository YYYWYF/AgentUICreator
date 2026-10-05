import { useEffect, useRef, useState } from "react";
import type { UpdateInspection, UpgradePlan } from "@agent-ui/project-control/updates";

export interface UpdateNotificationStateStore { isDismissed(projectId: string, fingerprint: string): boolean; dismiss(projectId: string, fingerprint: string): void }
export class LocalUpdateNotificationStateStore implements UpdateNotificationStateStore {
  isDismissed(projectId: string, fingerprint: string) { try { return localStorage.getItem(`creator-plugin-update:${projectId}:${fingerprint}`) === "dismissed"; } catch { return false; } }
  dismiss(projectId: string, fingerprint: string) { try { localStorage.setItem(`creator-plugin-update:${projectId}:${fingerprint}`, "dismissed"); } catch { /* Browser storage is optional. */ } }
}
const store = new LocalUpdateNotificationStateStore();
async function updateRequest<T>(workspaceId: string, route: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/__creator/updates/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "插件更新操作失败。");
  return result;
}
export function CreatorPluginUpdates({ workspaceId, busy, modelReady, checkRequest, onPageChange, onModelMerge }: { workspaceId: string; busy: boolean; modelReady: boolean; checkRequest: number; onPageChange: (open: boolean) => void; onModelMerge: (prompt: string) => void }) {
  const [inspection, setInspection] = useState<UpdateInspection | null>(null);
  const [pageOpen, setPageOpen] = useState(false);
  const [banner, setBanner] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState<UpgradePlan | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeFiles, setMergeFiles] = useState<{ path: string; base?: string | null; target?: string | null }[]>([]);
  const generation = useRef(0);
  const active = useRef(true);
  const lastCheckRequest = useRef(checkRequest);
  const check = async (manual: boolean) => {
    const requestGeneration = ++generation.current;
    if (manual) { setWorking(true); setMessage(""); }
    try {
      const result = await updateRequest<UpdateInspection>(workspaceId, "check");
      if (generation.current !== requestGeneration) return;
      setInspection(result);
      const count = result.plugins.filter(plugin => plugin.updateAvailable).length;
      if (manual) { if (count) setPageOpen(true); else setMessage("当前已是最新版本"); }
      setBanner(count > 0 && !store.isDismissed(workspaceId, result.fingerprint));
    } catch (error) { if (manual && generation.current === requestGeneration) setMessage(`暂时无法检查更新：${error instanceof Error ? error.message : String(error)}`); }
    finally { if (generation.current === requestGeneration) setWorking(false); }
  };
  useEffect(() => { active.current = true; void check(false); return () => { active.current = false; generation.current++; }; }, [workspaceId]);
  useEffect(() => { if (checkRequest !== lastCheckRequest.current) { lastCheckRequest.current = checkRequest; void check(true); } }, [checkRequest]);
  useEffect(() => { onPageChange(pageOpen); return () => onPageChange(false); }, [pageOpen, onPageChange]);
  const updates = inspection?.plugins.filter(plugin => plugin.updateAvailable) ?? [];
  const operation = async (run: () => Promise<void>) => {
    if (!active.current || working || busy) return;
    setWorking(true); setMessage("");
    try { await run(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setWorking(false); }
  };
  const createPlan = (pluginIds: string[]) => operation(async () => {
    const result = await updateRequest<UpgradePlan>(workspaceId, "plan", { pluginIds, releaseVersion: inspection!.releaseVersion });
    setPlan(result); setMerging(false); setMergeFiles([]);
  });
  const finish = async (route: "execute" | "adopt") => {
    await updateRequest(workspaceId, route, { planId: plan!.id, confirmed: true });
    setPlan(null); setMerging(false); setMergeFiles([]);
    await check(false); setMessage("插件更新完成，验证通过。");
  };
  return <section className="creator-plugin-updates" aria-label="插件更新">
    {banner && !pageOpen ? <div className="creator-update-banner" role="status"><span>有 {updates.length} 个插件可以更新</span><button type="button" onClick={() => setPageOpen(true)}>查看更新</button><button type="button" aria-label="关闭插件更新提示" onClick={() => { store.dismiss(workspaceId, inspection!.fingerprint); setBanner(false); }}>×</button></div> : null}
    {message ? <p role="status">{message}</p> : null}
    {pageOpen ? <div className="creator-update-page">
      <header><button type="button" onClick={() => setPageOpen(false)}>← 返回</button><h2>插件更新</h2></header>
      <p>{updates.length} 个插件可以更新 <button type="button" disabled={working || busy || !updates.length || !!plan} onClick={() => void createPlan(updates.map(plugin => plugin.pluginId))}>全部更新</button></p>
      {inspection?.compatibility !== "compatible" ? <p role="alert">当前 Creator 版本无法安装此更新，请先升级 Creator。</p> : null}
      {updates.map(plugin => <article key={plugin.pluginId}><h3>{plugin.name}</h3><p>{plugin.currentVersion ?? "未记录版本"} → {plugin.targetVersion} · {plugin.status}</p>
        {plugin.changelog.map(({ version, entry }) => <div key={version}><strong>{version} · {entry.summary}</strong><ul>{entry.changes.map((change, index) => <li key={index}>{change}</li>)}</ul></div>)}
        {plugin.status === "customized" ? <p>检测到本地源码修改，无法安全直接覆盖。</p> : null}
        <button type="button" disabled={working || busy || !!plan} onClick={() => void createPlan([plugin.pluginId])}>查看升级计划</button>
      </article>)}
      {plan ? <section className="creator-upgrade-plan" aria-label="升级计划"><h3>本次更新将修改</h3>
        <ul>{plan.items.map(item => <li key={item.itemId}>{item.itemId}{item.targetVersion ? ` ${item.currentVersion ?? "未安装 / 未记录"} → ${item.targetVersion}` : "（基础依赖）"} · {item.status}{item.changed ? "" : "（保持当前源码）"}</li>)}</ul>
        <p>预计修改 {plan.fileCount} 个源码文件，另同步 source-lock 和必要的派生注册表。</p>
        {plan.compatibility !== "compatible" ? <p role="alert">需要先升级 Creator。</p> : null}
        {plan.issues.map((issue, index) => <p key={index} role="alert">{issue}</p>)}
        {plan.requiresMerge ? <p>此计划包含本地修改。选择合并后完成验证，才能推进官方基线。</p> : null}
        <button type="button" disabled={working} onClick={() => { setPlan(null); setMerging(false); }}>暂不更新 / 取消</button>
        {!plan.blocked && !merging && !plan.requiresMerge ? <button type="button" disabled={working || busy} onClick={() => void operation(() => finish("execute"))}>确认更新</button> : null}
        {!plan.blocked && !merging && plan.requiresMerge ? <>
          <button type="button" disabled={working || busy || !modelReady} onClick={() => void operation(async () => { const result = await updateRequest<{ prompt: string; files: typeof mergeFiles }>(workspaceId, "merge", { planId: plan.id, confirmed: true }); if (!active.current) return; setMerging(true); setMergeFiles(result.files); onModelMerge(result.prompt); })}>使用模型合并</button>
          <button type="button" disabled={working || busy} onClick={() => void operation(async () => {
            try { const result = await updateRequest<{ files: typeof mergeFiles }>(workspaceId, "merge", { planId: plan.id, confirmed: true }); setMergeFiles(result.files); }
            catch { const result = await updateRequest<{ files: string[] }>(workspaceId, "manual", { planId: plan.id, confirmed: true }); setMergeFiles(result.files.map(path => ({ path }))); }
            setMerging(true);
          })}>手动合并</button>
        </> : null}
        {merging ? <div><p>等待合并：请在 IDE 或 Creator 中完成以下文件的修改。</p>
          {mergeFiles.map(file => <details key={file.path}><summary>{file.path}</summary>{file.base !== undefined ? <><h4>BASE</h4><pre>{file.base ?? "文件不存在"}</pre></> : null}{file.target !== undefined ? <><h4>TARGET</h4><pre>{file.target ?? "文件不存在"}</pre></> : <p>历史 Release 不可用；请参考上方 changelog 手动处理。</p>}</details>)}
          <button type="button" disabled={working || busy} onClick={() => void check(true)}>重新检查</button>
          <button type="button" disabled={working || busy} onClick={() => void operation(() => finish("adopt"))}>我已完成合并：验证并推进基线</button>
        </div> : null}
      </section> : null}
    </div> : null}
  </section>;
}
