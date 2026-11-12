import { PackageUpdatesOverview, actionableBlockedReleases, packageUpdateCount } from "./PackageUpdatesOverview.js";
import { UpdateReleaseNotes } from "./UpdateReleaseNotes.js";
import { creatorDisplayText } from "./product-presentation.js";
import { localizeCreatorPresentation, useAgentUILocale, DEFAULT_CREATOR_MESSAGES, type CreatorLocaleMessages, formatLocaleMessage } from "./i18n/locale.js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUpCircle, CircleCheck, RefreshCw, GitMerge, ShieldCheck } from "lucide-react";
import { Button } from "./components/button.js";
import { Alert, AlertDescription } from "./components/alert.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/card.js";
import type { UpdateInspection, UpgradePlan, PackageUpgradePlan, PackageUpgradeResult, PackageUpgradeStage } from "@za38.03/agent-ui-creator/project/updates";
import { useCreatorRefresh } from "./creatorRefresh.js";

export interface UpdateNotificationStateStore { isDismissed(projectId: string, fingerprint: string): boolean; dismiss(projectId: string, fingerprint: string): void }
export class LocalUpdateNotificationStateStore implements UpdateNotificationStateStore {
  isDismissed(projectId: string, fingerprint: string) { try { return localStorage.getItem(`creator-plugin-update:${projectId}:${fingerprint}`) === "dismissed"; } catch { return false; } }
  dismiss(projectId: string, fingerprint: string) { try { localStorage.setItem(`creator-plugin-update:${projectId}:${fingerprint}`, "dismissed"); } catch { /* Browser storage is optional. */ } }
}
const store = new LocalUpdateNotificationStateStore();
const availableCount = (result: UpdateInspection) => result.plugins.filter(plugin=>plugin.updateAvailable).length + (result.packageUpdates ? packageUpdateCount(result.packageUpdates) : 0) + (result.packageUpdates?.recovery ? 1 : 0);
async function updateRequest<T>(workspaceId: string, route: string, body: Record<string, unknown> = {}, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES, onStage?: (stage: PackageUpgradeStage) => void): Promise<T> {
  const response = await fetch(`/__creator/updates/${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...(onStage ? { Accept: "application/x-ndjson" } : {}) }, body: JSON.stringify({ workspaceId, ...body }) });
  let result;
  if (response.headers.get("content-type")?.startsWith("application/x-ndjson") && response.body) {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = "";
    const receive = (line: string) => { if (!line.trim()) return; const entry = JSON.parse(line);
      if (["installing", "checking", "recovering"].includes(entry.stage)) onStage?.(entry.stage);
      if ("result" in entry) result = entry.result;
      if (entry.error) result = { error: entry.error };
    };
    try { for (;;) { const chunk = await reader.read(); pending += decoder.decode(chunk.value, { stream: !chunk.done }); const lines = pending.split("\n"); pending = lines.pop()!; lines.forEach(receive); if (chunk.done) break; } receive(pending); }
    finally { reader.releaseLock(); }
    if (!result) throw new Error(localeMessages.pluginUpdates.pluginUpdateFailed);
  } else result = await response.json();
  if (!response.ok || result.error) {
    const errors: Record<string,string> = {
      PACKAGE_PLAN_STALE: localeMessages.pluginUpdates.planExpired,
      PACKAGE_RECOVERY_REQUIRED: localeMessages.pluginUpdates.packagesRecoveryRequired,
      PACKAGE_SOURCE_RECOVERY_REQUIRED: localeMessages.pluginUpdates.sourceRecoveryRequired,
      PACKAGE_OPERATION_ACTIVE: localeMessages.pluginUpdates.packageOperationBusy,
      PACKAGE_ONLINE_METADATA_REQUIRED: localeMessages.pluginUpdates.metadataUnavailable,
      PACKAGE_COMPATIBILITY_BLOCKED: localeMessages.pluginUpdates.compatibilityBlocked,
      PACKAGE_WORKSPACE_REQUIRES_SEPARATE_PLAN: localeMessages.pluginUpdates.packageSeparatePlan,
      PACKAGE_OVERRIDE_REQUIRES_SEPARATE_PLAN: localeMessages.pluginUpdates.packageSeparatePlan,
      PACKAGE_MANAGER_UNSUPPORTED: localeMessages.pluginUpdates.packageSeparatePlan,
      PACKAGE_EXISTING_LOCK_REQUIRED: localeMessages.pluginUpdates.packageSeparatePlan,
      PACKAGE_MULTIPLE_LOCKS: localeMessages.pluginUpdates.packageSeparatePlan,
      PACKAGE_DUPLICATE_DECLARATION: localeMessages.pluginUpdates.packageSeparatePlan,
      PACKAGE_LINKED_DECLARATION: localeMessages.pluginUpdates.packageSeparatePlan,
      PACKAGE_LINKED_INSTALLATION: localeMessages.pluginUpdates.packageSeparatePlan,
      PACKAGE_APPLICATION_MIGRATION_REQUIRED: localeMessages.pluginUpdates.packageMigrationRequired,
      PACKAGE_SHARED_API_MIGRATION_REQUIRED: localeMessages.pluginUpdates.packageMigrationRequired,
      PACKAGE_PEER_MIGRATION_REQUIRED: localeMessages.pluginUpdates.packageMigrationRequired,
      PACKAGE_DEPENDENCY_MIGRATION_REQUIRED: localeMessages.pluginUpdates.packageMigrationRequired,
      PACKAGE_NODE_INCOMPATIBLE: localeMessages.pluginUpdates.packageMigrationRequired,
      PACKAGE_ARTIFACT_INVALID: localeMessages.pluginUpdates.packageArtifactRejected,
      PACKAGE_ARTIFACT_IDENTITY: localeMessages.pluginUpdates.packageArtifactRejected,
      PACKAGE_ARTIFACT_INTEGRITY: localeMessages.pluginUpdates.packageArtifactRejected,
      PACKAGE_ARTIFACT_REQUIREMENTS: localeMessages.pluginUpdates.packageArtifactRejected,
      PACKAGE_CATALOG_IDENTITY: localeMessages.pluginUpdates.packageArtifactRejected,
      AGENT_UI_UPDATE_RECOVERY_REQUIRED: localeMessages.pluginUpdates.sourceRecoveryRequired,
      PLUGIN_SOURCE_PROTECTED_FILES_CHANGED: localeMessages.pluginUpdates.protectedFilesChanged,
      PLUGIN_SOURCE_MERGE_UNRESOLVED: localeMessages.pluginUpdates.mergeUnresolved,
      PLUGIN_SOURCE_PLAN_STALE: localeMessages.pluginUpdates.planExpired,
      PLUGIN_SOURCE_TARGET_CHANGED: localeMessages.pluginUpdates.planExpired,
      PLUGIN_SOURCE_PLAN_EXPIRED: localeMessages.pluginUpdates.planExpired,
      PLUGIN_SOURCE_DEPENDENCY_CONFLICT: localeMessages.pluginUpdates.sourceDependencyConflict,
      PLUGIN_SOURCE_CONTEXT_DUPLICATED: localeMessages.pluginUpdates.sourceContextDuplicated,
      PLUGIN_SOURCE_DEPENDENCY_STATE_CHANGED: localeMessages.pluginUpdates.sourceDependencyPreparationFailed,
      PLUGIN_SOURCE_DEPENDENCIES_REQUIRED: localeMessages.pluginUpdates.sourceDependencyPreparationFailed,
    };
    throw new Error(errors[result.error] ?? (typeof result.error === "string" && result.error.startsWith("PACKAGE_") ? localeMessages.pluginUpdates.packageOperationBlocked : result.error) ?? localeMessages.pluginUpdates.pluginUpdateFailed);
  }
  return result;
}
export function CreatorPluginUpdates({ workspaceId, busy, modelReady, checkRequest, notificationTarget, pageOpen: controlledPageOpen, onPageChange, onModelMerge }: { workspaceId: string; busy: boolean; modelReady: boolean; checkRequest: number; notificationTarget?: HTMLElement | null; pageOpen?: boolean; onPageChange: (open: boolean) => void; onModelMerge: (prompt: string) => void }) {
  const localeMessages = useAgentUILocale();
  const [packagePlan, setPackagePlan] = useState<PackageUpgradePlan | null>(null);
  const [inspection, setInspection] = useState<UpdateInspection | null>(null);
  const [localPageOpen, setLocalPageOpen] = useState(false);
  const pageOpen = controlledPageOpen ?? localPageOpen;
  const setPageOpen = (open: boolean) => { setLocalPageOpen(open); onPageChange(open); };
  const [banner, setBanner] = useState(false);
  const [working, setWorking] = useState(false);
  const [packageStage, setPackageStage] = useState<PackageUpgradeStage | "planning">();
  const [completedPackages, setCompletedPackages] = useState<PackageUpgradePlan["packages"]>([]);
  const [completedPlugins, setCompletedPlugins] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const operationActive = useRef(false);
  const [message, setMessage] = useState("");
  const [checkError, setCheckError] = useState("");
  const [plan, setPlan] = useState<UpgradePlan | null>(null);
  const [planTarget, setPlanTarget] = useState<string | null>(null);
  const planRegion = useRef<HTMLElement>(null);
  const [merging, setMerging] = useState(false);
  const [mergeFiles, setMergeFiles] = useState<{ path: string; base?: string | null; local?: string | null; target?: string | null }[]>([]);
  const generation = useRef(0);
  const active = useRef(true);
  const lastCheckRequest = useRef(checkRequest);
  useCreatorRefresh(data => {
    if (data.projectId !== workspaceId || !data.updates || working) return;
    generation.current++;
    setInspection(data.updates);
    setCheckError("");
    setBanner(availableCount(data.updates) > 0 && !store.isDismissed(workspaceId, data.updates.fingerprint));
  });
  const check = async (manual: boolean) => {
    if (manual && operationActive.current) return;
    const requestGeneration = ++generation.current;
    if (manual) { setWorking(true); setMessage(""); }
    try {
      const result = await updateRequest<UpdateInspection>(workspaceId, "check", { refresh: manual }, localeMessages);
      if (generation.current !== requestGeneration) return;
      setInspection(result);
      setCheckError("");
      const count = availableCount(result);
      if (manual) { if (count) setPageOpen(true); else setMessage(result.packageUpdates && result.packageUpdates.status !== "online" ? localeMessages.pluginUpdates.metadataUnavailable : result.packageUpdates && actionableBlockedReleases(result.packageUpdates).length ? localeMessages.pluginUpdates.compatibilityBlocked : result.packageUpdates && !result.packageUpdates.recommendedReleaseId ? result.packageUpdates.blockedReleases.length ? localeMessages.pluginUpdates.noNewerRelease : localeMessages.pluginUpdates.metadataUnavailable : localeMessages.pluginUpdates.alreadyUpToDate); }
      setBanner(count > 0 && !store.isDismissed(workspaceId, result.fingerprint));
    } catch (error) { if (generation.current === requestGeneration) {
      setInspection(null); setBanner(false);
      setCheckError(formatLocaleMessage(localeMessages.pluginUpdates.couldNotCheckUpdates, error instanceof Error ? error.message : String(error)));
    } }
    finally { if (manual && generation.current === requestGeneration) setWorking(false); }
  };
  useEffect(() => { active.current = true; setPackagePlan(null); setPlan(null); setPlanTarget(null); setPackageStage(undefined); setCompletedPackages([]); setCompletedPlugins({}); setFailed(false); setMessage(""); setWorking(false); operationActive.current = false; void check(false); return () => { active.current = false; generation.current++; }; }, [workspaceId]);
  useEffect(() => { if (checkRequest !== lastCheckRequest.current) { lastCheckRequest.current = checkRequest; void check(true); } }, [checkRequest]);
  useEffect(() => () => onPageChange(false), [onPageChange]);
  useEffect(() => { if (pageOpen && !operationActive.current) void check(false); }, [pageOpen]);
  const totalUpdates = inspection ? availableCount(inspection) : 0;
  const overview = inspection?.packageUpdates;
  const updateStatus = !inspection || overview && overview.status !== "online"
    ? working ? localeMessages.pluginUpdates.checkingUpdates : localeMessages.pluginUpdates.updateStatusUnavailable
    : totalUpdates ? formatLocaleMessage(localeMessages.pluginUpdates.availableUpdates, totalUpdates)
    : overview && actionableBlockedReleases(overview).length ? localeMessages.pluginUpdates.compatibilityBlocked
    : overview && !overview.recommendedReleaseId ? overview.blockedReleases.length ? localeMessages.pluginUpdates.noNewerRelease : localeMessages.pluginUpdates.updateStatusUnavailable
    : localeMessages.pluginUpdates.alreadyUpToDate;
  const updates = inspection?.plugins.filter(plugin => plugin.updateAvailable) ?? [];
  const sourcePlugins = inspection?.plugins.filter(plugin => plugin.delivery === "source-owned") ?? [];
  const visibleSourcePlugins = inspection?.plugins.filter(plugin => plugin.delivery === "source-owned" || plugin.updateAvailable) ?? [];
  const sourceCardId = (id: string) => `creator-source-${encodeURIComponent(workspaceId)}-${id}`;
  const pluginName = (id: string, fallback: string) => creatorDisplayText(inspection?.pluginNames?.[id] ?? fallback);
  const operation = async (run: () => Promise<void>) => {
    if (!active.current || operationActive.current || working || busy) return;
    operationActive.current = true;
    setWorking(true); setMessage(""); setFailed(false);
    try { await run(); } catch (error) { setFailed(true); setMessage(formatLocaleMessage(localeMessages.pluginUpdates.updateFailed, error instanceof Error ? error.message : String(error))); }
    finally { operationActive.current = false; setWorking(false); setPackageStage(undefined); }
  };
  const createPlan = (pluginIds: string[], target: string) => operation(async () => {
    setPlanTarget(target);
    const result = await updateRequest<UpgradePlan>(workspaceId, "plan", { pluginIds, releaseVersion: inspection!.releaseVersion }, localeMessages);
    setPlan(result); setMerging(false); setMergeFiles([]);
  });
  const finish = async (route: "execute" | "adopt") => {
    await updateRequest(workspaceId, route, { planId: plan!.id, confirmed: true }, localeMessages);
    const completed = Object.fromEntries((inspection?.plugins ?? []).filter(plugin => plan!.requestedPlugins.includes(plugin.pluginId)).map(plugin => [plugin.pluginId, plugin.targetVersion]));
    setCompletedPlugins(previous => ({ ...previous, ...completed }));
    setPlan(null); setPlanTarget(null); setMerging(false); setMergeFiles([]);
    await check(false);
  };
  useEffect(() => {
    if (!plan || !pageOpen) return;
    planRegion.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    planRegion.current?.focus({ preventScroll: true });
  }, [plan, pageOpen]);
  const planContent = plan ? <section className="creator-upgrade-plan" ref={planRegion} tabIndex={-1} role="region" aria-label={localeMessages.pluginUpdates.updatePlan}>
        <h3 className="creator-source-plan-title"><GitMerge aria-hidden="true" />{merging ? localeMessages.pluginUpdates.reviewSourceMerge : plan.requiresMerge ? localeMessages.pluginUpdates.mergeSourceTitle : localeMessages.pluginUpdates.confirmTheseUpdates}</h3>
        <div className="cui:flex cui:flex-col cui:gap-3 cui:text-xs">
          {plan.kind !== "owned-source" && plan.items.length ? <details className="creator-update-details"><summary>{localeMessages.pluginUpdates.sourceAffectedComponents}</summary><ul className="cui:list-disc cui:space-y-1 cui:pl-4">{plan.items.map(item => <li key={creatorDisplayText(item.itemId)}>{creatorDisplayText(item.itemId)}{item.targetVersion ? formatLocaleMessage(localeMessages.pluginUpdates.message, item.currentVersion ?? localeMessages.pluginUpdates.notInstalledUntracked, item.targetVersion) : null}</li>)}</ul></details> : null}
          <div className="creator-update-callout"><ShieldCheck aria-hidden="true"/><p>{plan.requiresMerge ? localeMessages.pluginUpdates.sourceMergePreservation : localeMessages.pluginUpdates.sourceSyncPreservation}</p></div>
          {plan.dependencyChanges?.length ? <div className="creator-update-callout"><div><p>{localeMessages.pluginUpdates.sourceDependenciesNotice}</p><ul>{plan.dependencyChanges.map(dependency => <li key={dependency}><code>{dependency}</code></li>)}</ul></div></div> : null}
          {plan.compatibility !== "compatible" ? <Alert variant="destructive"><AlertDescription>{localeMessages.pluginUpdates.upgradeCreatorFirst}</AlertDescription></Alert> : null}
          {plan.issues.map((issue, index) => <Alert key={index} variant="destructive"><AlertDescription>{creatorDisplayText(issue)}</AlertDescription></Alert>)}
          {!merging ? <p>{plan.requiresMerge ? localeMessages.pluginUpdates.sourceMergeConfirmation : localeMessages.pluginUpdates.sourceSyncConfirmation}</p> : null}
          <div className="creator-update-actions" hidden={merging}>
            <Button size="sm" variant="outline" disabled={working || busy} onClick={() => { setPlan(null); setPlanTarget(null); setMerging(false); }}>{localeMessages.pluginUpdates.sourceNotNow}</Button>
            {!plan.blocked && !merging && !plan.requiresMerge ? <Button size="sm" disabled={working || busy} onClick={() => void operation(() => finish("execute"))}>{working ? <><RefreshCw aria-hidden="true" className="cui:animate-spin"/>{localeMessages.pluginUpdates.updating}</> : localeMessages.pluginUpdates.confirmUpdate}</Button> : null}
            {!plan.blocked && !merging && plan.requiresMerge ? <>
              <Button size="sm" disabled={working || busy || !modelReady} onClick={() => void operation(async () => { const result = await updateRequest<{ prompt: string; files: typeof mergeFiles }>(workspaceId, "merge", { planId: plan.id, confirmed: true }, localeMessages); if (!active.current) return; setMerging(true); setMergeFiles(result.files); setPageOpen(false); onModelMerge(result.prompt); })}>{localeMessages.pluginUpdates.mergeWithModel}</Button>
              <Button size="sm" variant="outline" disabled={working || busy} onClick={() => void operation(async () => {
                try { const result = await updateRequest<{ files: typeof mergeFiles }>(workspaceId, "merge", { planId: plan.id, confirmed: true }, localeMessages); setMergeFiles(result.files); }
                catch { const result = await updateRequest<{ files: string[] }>(workspaceId, "manual", { planId: plan.id, confirmed: true }, localeMessages); setMergeFiles(result.files.map(path => ({ path }))); }
                setMerging(true);
              })}>{localeMessages.pluginUpdates.mergeManually}</Button>
            </> : null}
          </div>
          {merging ? <div className="cui:flex cui:flex-col cui:gap-3"><p>{localeMessages.pluginUpdates.sourceReviewConfirmation}</p>
            <details className="creator-update-details creator-source-diff"><summary>{formatLocaleMessage(localeMessages.pluginUpdates.sourceCodeComparison, mergeFiles.length)}</summary>
            {mergeFiles.map(file => <details key={creatorDisplayText(file.path)} className="creator-source-diff-file"><summary>{creatorDisplayText(file.path)}</summary>{file.base !== undefined ? <><h4>{localeMessages.pluginUpdates.sourceOriginal}</h4><pre>{creatorDisplayText(file.base ?? localeMessages.pluginUpdates.fileDoesNotExist)}</pre></> : null}{file.local !== undefined ? <><h4>{localeMessages.pluginUpdates.sourceLocal}</h4><pre>{creatorDisplayText(file.local ?? localeMessages.pluginUpdates.fileDoesNotExist)}</pre></> : null}{file.target !== undefined ? <><h4>{localeMessages.pluginUpdates.sourceNew}</h4><pre>{creatorDisplayText(file.target ?? localeMessages.pluginUpdates.fileDoesNotExist)}</pre></> : <p>{localeMessages.pluginUpdates.historicalReleaseUnavailableUseTheChangelogAboveTo}</p>}</details>)}
            </details>
            <div className="creator-update-actions">
              <Button size="sm" variant="outline" disabled={working || busy} onClick={() => void check(true)}>{localeMessages.pluginUpdates.recheck}</Button>
              <Button size="sm" disabled={working || busy} onClick={() => void operation(() => finish("adopt"))}>{working ? <><RefreshCw aria-hidden="true" className="cui:animate-spin"/>{localeMessages.pluginUpdates.updating}</> : localeMessages.pluginUpdates.mergeCompleteValidateAndAdvanceBaseline}</Button>
            </div>
          </div> : null}
        </div>
      </section> : null;
  const planFeedback = <>
    {working ? <p className="cui:flex cui:items-center cui:gap-2 cui:text-xs cui:text-muted-foreground" role="status"><RefreshCw aria-hidden="true" className="cui:size-3.5 cui:animate-spin" />{plan ? localeMessages.pluginUpdates.sourceUpdating : localeMessages.pluginUpdates.checkingUpdateContents}</p> : null}
    {message ? <Alert role="status"><AlertDescription>{localizeCreatorPresentation(message, localeMessages)}</AlertDescription></Alert> : null}
  </>;
  const notification = banner && !pageOpen ? <div className="creator-update-banner" role="status">
    <Button size="sm" variant="ghost" className="creator-update-entry" aria-label={localeMessages.pluginUpdates.viewUpdates} title={formatLocaleMessage(inspection?.packageUpdates ? localeMessages.pluginUpdates.availableUpdates : localeMessages.pluginUpdates.pluginsCanBeUpdated, totalUpdates)} onClick={() => setPageOpen(true)}>
      <ArrowUpCircle aria-hidden="true" />
      <span aria-hidden="true">{totalUpdates}</span>
      <span className="cui:sr-only">{inspection?.packageUpdates ? formatLocaleMessage(localeMessages.pluginUpdates.availableUpdates,totalUpdates) : `${localeMessages.pluginUpdates.thereAre} ${updates.length} ${localeMessages.pluginUpdates.pluginsWithUpdates}`}</span>
    </Button>
  </div> : null;
  return <section className="creator-plugin-updates creator-ui-scope" aria-label={localeMessages.pluginUpdates.pluginUpdates} aria-busy={working}>
    {notificationTarget ? createPortal(notification, notificationTarget) : notification}
    {working && !pageOpen ? <p className="cui:flex cui:items-center cui:gap-2 cui:py-2 cui:text-xs cui:text-muted-foreground" role="status"><RefreshCw aria-hidden="true" className="cui:size-3.5 cui:animate-spin" />{localeMessages.pluginUpdates.checkingUpdates}</p> : null}
    {message && (planTarget === null || !pageOpen) ? <Alert className="cui:my-2" variant={failed ? "destructive" : "default"} role={failed ? "alert" : "status"}><AlertDescription>{localizeCreatorPresentation(message, localeMessages)}</AlertDescription></Alert> : null}
    {pageOpen ? <div className="creator-update-page cui:space-y-3" aria-busy={working}>
      <header className="creator-update-page-heading">
        <Button size="icon-sm" variant="ghost" aria-label={localeMessages.pluginUpdates.back} onClick={() => setPageOpen(false)}><ArrowLeft aria-hidden="true" /></Button>
        <div><h2>{inspection?.packageUpdates ? localeMessages.pluginUpdates.updateCenter : localeMessages.pluginUpdates.pluginUpdates}</h2><p>{localeMessages.pluginUpdates.updateCenterDescription}</p></div>

      </header>
      <div className="creator-update-page-meta">
        <p className="cui:text-xs cui:text-muted-foreground">{updateStatus}</p>
        {banner ? <Button size="xs" variant="ghost" aria-label={localeMessages.pluginUpdates.closePluginUpdateNotice} onClick={() => { store.dismiss(workspaceId, inspection!.fingerprint); setBanner(false); setPageOpen(false); }}>{localeMessages.pluginUpdates.dismissForNow}</Button> : null}
      </div>
      {failed ? <Button size="sm" variant="outline" disabled={working || busy} onClick={() => { setPackagePlan(null); setPlan(null); setPlanTarget(null); setFailed(false); void check(true); }}>{localeMessages.pluginUpdates.retryUpdate}</Button> : null}
      {inspection?.packageUpdates ? <PackageUpdatesOverview overview={inspection.packageUpdates} sourcePlugins={sourcePlugins} pluginNames={inspection.pluginNames} working={working || busy} stage={packageStage} completed={completedPackages} refresh={()=>void check(true)} plan={packagePlan}
        onPlan={()=>void operation(async()=>{setPlanTarget(null);setPackageStage("planning");setPackagePlan(await updateRequest<PackageUpgradePlan>(workspaceId,"packages/plan",{},localeMessages));})}
        onCancel={()=>setPackagePlan(null)}
        onExecute={()=>void operation(async()=>{setPackageStage("installing");const completed=packagePlan!.packages;const result=await updateRequest<PackageUpgradeResult>(workspaceId,"packages/execute",{planId:packagePlan!.id,confirmed:true},localeMessages,setPackageStage);setPackagePlan(null);if(result.status==="installed")setCompletedPackages(completed);else{setFailed(true);setMessage(localeMessages.pluginUpdates[result.status === "restored" ? "packagesRestored" : "packagesRecoveryRequired"]);}await check(false);})}
        onRecover={()=>void operation(async()=>{const result=await updateRequest<PackageUpgradeResult>(workspaceId,"packages/recover",{planId:inspection.packageUpdates!.recovery!.id,confirmed:true},localeMessages);await check(false);setMessage(localeMessages.pluginUpdates[result.status==="restored"?"packagesRestored":"packagesRecoveryRequired"]);})} /> : null}
      {checkError ? <Alert variant="destructive" role="alert"><AlertDescription>{checkError}</AlertDescription></Alert> : null}
      {inspection && inspection.compatibility !== "compatible" ? <Alert variant="destructive"><AlertDescription>{localeMessages.pluginUpdates.thisCreatorVersionCannotInstallTheUpdateUpgrade}</AlertDescription></Alert> : null}
      {planTarget === "all" ? <>{planFeedback}{planContent}</> : null}
      {visibleSourcePlugins.length ? <div className="creator-update-source-heading"><div><h3><GitMerge aria-hidden="true"/>{localeMessages.pluginUpdates.sourceSection}</h3><p>{localeMessages.pluginUpdates.sourceSectionDescription}</p></div>{updates.length > 1 && !updates.some(plugin=>plugin.delivery === "source-owned") ? <Button size="sm" variant="outline" disabled={working || busy || !!plan} onClick={() => void createPlan(updates.map(plugin => plugin.pluginId), "all")}>{localeMessages.pluginUpdates.updateAll}</Button> : null}</div> : null}
      {visibleSourcePlugins.map(plugin => {
        const waitingForPackage = !plugin.updateAvailable && inspection?.packageUpdates?.packages.some(pkg => pkg.name === "@za38.03/agent-ui-plugins" && pkg.history.some(change => change.pluginId === plugin.pluginId));
        return <Card key={plugin.pluginId} id={sourceCardId(plugin.pluginId)} tabIndex={-1} className="creator-update-plugin-card cui:gap-3 cui:py-4">
        <CardHeader className="creator-update-plugin-heading cui:gap-1 cui:px-4">
          <CardTitle className="cui:text-sm">{pluginName(plugin.pluginId, plugin.name)}</CardTitle>
          {!completedPlugins[plugin.pluginId] ? <CardDescription className="cui:text-xs">{formatLocaleMessage(localeMessages.pluginUpdates.currentVersion, plugin.currentVersion ?? localeMessages.pluginUpdates.versionUntracked)}</CardDescription> : null}
          <span className="creator-update-plugin-status" data-customized={plugin.status === "customized"} data-current={!plugin.updateAvailable && !waitingForPackage}>{plugin.updateAvailable ? localeMessages.pluginUpdates.updateAvailable : waitingForPackage ? localeMessages.pluginUpdates.sourcePackageUpdateNeeded : inspection?.packageUpdates?.status === "online" && inspection.packageUpdates.packages.some(pkg => pkg.name.endsWith("-plugins") && !pkg.updateAvailable && pkg.targetVersion) ? localeMessages.pluginUpdates.upToDate : localeMessages.pluginUpdates.sourceUpToDate}</span>
        </CardHeader>
        <CardContent className="cui:flex cui:flex-col cui:gap-3 cui:px-4 cui:text-xs">
          {completedPlugins[plugin.pluginId] ? <p className="creator-update-success" role="status"><CircleCheck aria-hidden="true"/>{formatLocaleMessage(localeMessages.pluginUpdates.sourceUpdateComplete, pluginName(plugin.pluginId, plugin.name), completedPlugins[plugin.pluginId])}</p> : null}
          <UpdateReleaseNotes targetVersion={plugin.targetVersion} historyOnly={!plugin.updateAvailable} entries={plugin.changelog.flatMap(({version,entry}) => (entry.changes.length ? entry.changes : [entry.summary]).map(change => ({version,content:creatorDisplayText(change)})))}/>
          {plugin.delivery === "source-owned" ? inspection?.packageUpdates?.packages.filter(pkg => pkg.name === "@za38.03/agent-ui-plugins" && pkg.history.some(change => change.pluginId === plugin.pluginId)).map(pkg => <div key={pkg.name} className="creator-source-package-changes"><p>{localeMessages.pluginUpdates.sourceFutureChanges}</p><details className="creator-update-details"><summary>{localeMessages.pluginUpdates.viewUpdateContents}</summary><ul>{pkg.history.filter(change => change.pluginId === plugin.pluginId).map((change,index) => <li key={index}>{change.kind === "breaking" ? `${localeMessages.pluginUpdates.breakingChange} · ` : ""}{creatorDisplayText(change.summary)}</li>)}</ul></details></div>) : null}
          {plugin.status === "customized" && planTarget !== plugin.pluginId ? <p className="creator-update-local-notice">{localeMessages.pluginUpdates.localSourceChangesDetectedTheyCannotBeSafely}</p> : null}
          {plugin.updateAvailable ? <Button hidden={planTarget === plugin.pluginId} size="sm" variant="outline" className="creator-update-plan-entry" disabled={working || busy || !!plan} onClick={() => void createPlan([plugin.pluginId], plugin.pluginId)}>{localeMessages.pluginUpdates.updatePlugin}</Button> : null}
          {plugin.delivery === "source-owned" && plugin.updateAvailable ? <p className="creator-update-muted">{localeMessages.pluginUpdates.ownedPluginPreservation}</p> : null}
          {planTarget === plugin.pluginId ? <>{planFeedback}{planContent}</> : null}
        </CardContent>
      </Card>; })}
      {inspection?.packageUpdates ? <PackageUpdatesOverview toolsOnly overview={inspection.packageUpdates} working={working || busy} refresh={()=>void check(true)}/> : null}
    </div> : null}
  </section>;
}
