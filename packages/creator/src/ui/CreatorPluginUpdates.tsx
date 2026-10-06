import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUpCircle, RefreshCw } from "lucide-react";
import { Button } from "./components/button.js";
import { Alert, AlertDescription } from "./components/alert.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/card.js";
import type { UpdateInspection, UpgradePlan } from "@agent-ui/project-control/updates";

export interface UpdateNotificationStateStore { isDismissed(projectId: string, fingerprint: string): boolean; dismiss(projectId: string, fingerprint: string): void }
export class LocalUpdateNotificationStateStore implements UpdateNotificationStateStore {
  isDismissed(projectId: string, fingerprint: string) { try { return localStorage.getItem(`creator-plugin-update:${projectId}:${fingerprint}`) === "dismissed"; } catch { return false; } }
  dismiss(projectId: string, fingerprint: string) { try { localStorage.setItem(`creator-plugin-update:${projectId}:${fingerprint}`, "dismissed"); } catch { /* Browser storage is optional. */ } }
}
const updateStatusLabels: Record<string, string> = { managed: "可直接更新", customized: "本地已修改", missing: "尚未安装", conflict: "需要处理冲突", unknown: "需要检查" };
const updateStatusLabel = (status: string) => updateStatusLabels[status] ?? "需要检查";
const store = new LocalUpdateNotificationStateStore();
async function updateRequest<T>(workspaceId: string, route: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/__creator/updates/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "插件更新操作失败。");
  return result;
}
export function CreatorPluginUpdates({ workspaceId, busy, modelReady, checkRequest, notificationTarget, pageOpen: controlledPageOpen, onPageChange, onModelMerge }: { workspaceId: string; busy: boolean; modelReady: boolean; checkRequest: number; notificationTarget?: HTMLElement | null; pageOpen?: boolean; onPageChange: (open: boolean) => void; onModelMerge: (prompt: string) => void }) {
  const [inspection, setInspection] = useState<UpdateInspection | null>(null);
  const [localPageOpen, setLocalPageOpen] = useState(false);
  const pageOpen = controlledPageOpen ?? localPageOpen;
  const setPageOpen = (open: boolean) => { setLocalPageOpen(open); onPageChange(open); };
  const [banner, setBanner] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState<UpgradePlan | null>(null);
  const [planTarget, setPlanTarget] = useState<string | null>(null);
  const planRegion = useRef<HTMLElement>(null);
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
  useEffect(() => () => onPageChange(false), [onPageChange]);
  const updates = inspection?.plugins.filter(plugin => plugin.updateAvailable) ?? [];
  const operation = async (run: () => Promise<void>) => {
    if (!active.current || working || busy) return;
    setWorking(true); setMessage("");
    try { await run(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setWorking(false); }
  };
  const createPlan = (pluginIds: string[], target: string) => operation(async () => {
    setPlanTarget(target);
    const result = await updateRequest<UpgradePlan>(workspaceId, "plan", { pluginIds, releaseVersion: inspection!.releaseVersion });
    setPlan(result); setMerging(false); setMergeFiles([]);
  });
  const finish = async (route: "execute" | "adopt") => {
    await updateRequest(workspaceId, route, { planId: plan!.id, confirmed: true });
    setPlan(null); setPlanTarget(null); setMerging(false); setMergeFiles([]);
    await check(false); setMessage("插件更新完成，验证通过。");
  };
  useEffect(() => {
    if (!plan || !pageOpen) return;
    planRegion.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    planRegion.current?.focus({ preventScroll: true });
  }, [plan, pageOpen]);
  const planContent = plan ? <section className="creator-upgrade-plan" ref={planRegion} tabIndex={-1} role="region" aria-label="更新方案">
        <h3 className="cui:text-sm cui:font-semibold">确认本次更新</h3>
        <div className="cui:flex cui:flex-col cui:gap-3 cui:text-xs">
          <ul className="cui:list-disc cui:space-y-1 cui:pl-4">{plan.items.map(item => <li key={item.itemId}>{item.itemId}{item.targetVersion ? ` ${item.currentVersion ?? "未安装 / 未记录"} → ${item.targetVersion}` : "（基础依赖）"} · {updateStatusLabel(item.status)}{item.changed ? "" : "（保持当前源码）"}</li>)}</ul>
          <p className="cui:text-muted-foreground">预计修改 {plan.fileCount} 个源码文件，另同步 source-lock 和必要的派生注册表。</p>
          {plan.compatibility !== "compatible" ? <Alert variant="destructive"><AlertDescription>需要先升级 Creator。</AlertDescription></Alert> : null}
          {plan.issues.map((issue, index) => <Alert key={index} variant="destructive"><AlertDescription>{issue}</AlertDescription></Alert>)}
          {plan.requiresMerge ? <p>此计划包含本地修改。选择合并后完成验证，才能推进官方基线。</p> : null}
          <div className="cui:flex cui:flex-wrap cui:gap-2">
            <Button size="sm" variant="outline" disabled={working} onClick={() => { setPlan(null); setPlanTarget(null); setMerging(false); }}>暂不更新 / 取消</Button>
            {!plan.blocked && !merging && !plan.requiresMerge ? <Button size="sm" disabled={working || busy} onClick={() => void operation(() => finish("execute"))}>确认更新</Button> : null}
            {!plan.blocked && !merging && plan.requiresMerge ? <>
              <Button size="sm" disabled={working || busy || !modelReady} onClick={() => void operation(async () => { const result = await updateRequest<{ prompt: string; files: typeof mergeFiles }>(workspaceId, "merge", { planId: plan.id, confirmed: true }); if (!active.current) return; setMerging(true); setMergeFiles(result.files); onModelMerge(result.prompt); })}>使用模型合并</Button>
              <Button size="sm" variant="outline" disabled={working || busy} onClick={() => void operation(async () => {
                try { const result = await updateRequest<{ files: typeof mergeFiles }>(workspaceId, "merge", { planId: plan.id, confirmed: true }); setMergeFiles(result.files); }
                catch { const result = await updateRequest<{ files: string[] }>(workspaceId, "manual", { planId: plan.id, confirmed: true }); setMergeFiles(result.files.map(path => ({ path }))); }
                setMerging(true);
              })}>手动合并</Button>
            </> : null}
          </div>
          {merging ? <div className="cui:flex cui:flex-col cui:gap-3"><p>等待合并：请在 IDE 或 Creator 中完成以下文件的修改。</p>
            {mergeFiles.map(file => <details key={file.path} className="cui:rounded-md cui:border cui:p-2"><summary className="cui:cursor-pointer cui:break-all">{file.path}</summary>{file.base !== undefined ? <><h4>BASE</h4><pre>{file.base ?? "文件不存在"}</pre></> : null}{file.target !== undefined ? <><h4>TARGET</h4><pre>{file.target ?? "文件不存在"}</pre></> : <p>历史 Release 不可用；请参考上方 changelog 手动处理。</p>}</details>)}
            <div className="cui:flex cui:flex-wrap cui:gap-2">
              <Button size="sm" variant="outline" disabled={working || busy} onClick={() => void check(true)}>重新检查</Button>
              <Button size="sm" disabled={working || busy} onClick={() => void operation(() => finish("adopt"))}>我已完成合并：验证并推进基线</Button>
            </div>
          </div> : null}
        </div>
      </section> : null;
  const planFeedback = <>
    {working && !plan ? <p className="cui:flex cui:items-center cui:gap-2 cui:text-xs cui:text-muted-foreground" role="status"><RefreshCw aria-hidden="true" className="cui:size-3.5 cui:animate-spin" />正在检查更新内容…</p> : null}
    {message ? <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert> : null}
  </>;
  const notification = banner && !pageOpen ? <div className="creator-update-banner" role="status">
    <Button size="sm" variant="ghost" className="creator-update-entry" aria-label="查看更新" title={`有 ${updates.length} 个插件可以更新`} onClick={() => setPageOpen(true)}>
      <ArrowUpCircle aria-hidden="true" />
      <span aria-hidden="true">{updates.length}</span>
      <span className="cui:sr-only">有 {updates.length} 个插件可以更新</span>
    </Button>
  </div> : null;
  return <section className="creator-plugin-updates creator-ui-scope" aria-label="插件更新">
    {notificationTarget ? createPortal(notification, notificationTarget) : notification}
    {working && !pageOpen ? <p className="cui:flex cui:items-center cui:gap-2 cui:py-2 cui:text-xs cui:text-muted-foreground" role="status"><RefreshCw aria-hidden="true" className="cui:size-3.5 cui:animate-spin" />正在检查更新…</p> : null}
    {message && (planTarget === null || !pageOpen) ? <Alert className="cui:my-2" role="status"><AlertDescription>{message}</AlertDescription></Alert> : null}
    {pageOpen ? <div className="creator-update-page cui:space-y-3" aria-busy={working}>
      <header className="cui:flex cui:items-center cui:gap-2">
        <Button size="icon-sm" variant="ghost" aria-label="返回" onClick={() => setPageOpen(false)}><ArrowLeft aria-hidden="true" /></Button>
        <h2 className="cui:flex-1 cui:text-sm cui:font-semibold">插件更新</h2>
        <Button size="sm" disabled={working || busy || !updates.length || !!plan} onClick={() => void createPlan(updates.map(plugin => plugin.pluginId), "all")}>全部更新</Button>
      </header>
      <div className="cui:flex cui:items-center cui:justify-between cui:gap-2">
        <p className="cui:text-xs cui:text-muted-foreground">{updates.length} 个插件可以更新</p>
        {banner ? <Button size="xs" variant="ghost" aria-label="关闭插件更新提示" onClick={() => { store.dismiss(workspaceId, inspection!.fingerprint); setBanner(false); setPageOpen(false); }}>暂不提醒</Button> : null}
      </div>
      {inspection?.compatibility !== "compatible" ? <Alert variant="destructive"><AlertDescription>当前 Creator 版本无法安装此更新，请先升级 Creator。</AlertDescription></Alert> : null}
      {planTarget === "all" ? <>{planFeedback}{planContent}</> : null}
      {updates.map(plugin => <Card key={plugin.pluginId} className="creator-update-plugin-card cui:gap-3 cui:py-4">
        <CardHeader className="creator-update-plugin-heading cui:gap-1 cui:px-4">
          <CardTitle className="cui:text-sm">{plugin.name}</CardTitle>
          <CardDescription className="cui:text-xs">{plugin.currentVersion ?? "未记录版本"} → {plugin.targetVersion}</CardDescription>
          <span className="creator-update-plugin-status" data-customized={plugin.status === "customized"}>{updateStatusLabel(plugin.status)}</span>
        </CardHeader>
        <CardContent className="cui:flex cui:flex-col cui:gap-3 cui:px-4 cui:text-xs">
          {plugin.changelog.map(({ version, entry }) => <div key={version}><strong>{version} · {entry.summary}</strong><ul className="cui:my-2 cui:list-disc cui:space-y-1 cui:pl-4 cui:text-muted-foreground">{entry.changes.map((change, index) => <li key={index}>{change}</li>)}</ul></div>)}
          {plugin.status === "customized" ? <p className="cui:text-amber-700">检测到本地源码修改，无法安全直接覆盖。</p> : null}
          <Button size="sm" variant="outline" className="creator-update-plan-entry" disabled={working || busy || !!plan} onClick={() => void createPlan([plugin.pluginId], plugin.pluginId)}>查看更新内容</Button>
          {planTarget === plugin.pluginId ? <>{planFeedback}{planContent}</> : null}
        </CardContent>
      </Card>)}
    </div> : null}
  </section>;
}
