import { useEffect, useRef } from "react";
import type { PackageUpdateOverview, PackageUpgradePlan } from "@za38.03/agent-ui-creator/operator/updates";
import { ArrowRight, ArrowUpRight, Check, CircleCheck, Package, RefreshCw, ShieldCheck } from "lucide-react";
import { useAgentUILocale, formatLocaleMessage } from "./i18n/locale.js";
import { Button } from "./components/button.js";

const packageLabel = (name: string) => name.replace(/^@za38\.03\/agent-ui-/, "");

export function PackageUpdatesOverview({ overview, refresh, working, plan, onPlan, onCancel, onExecute, onRecover }: {overview:PackageUpdateOverview;refresh:()=>void;working:boolean;plan?:PackageUpgradePlan|null;onPlan?:()=>void;onCancel?:()=>void;onExecute?:()=>void;onRecover?:()=>void}) {
  const messages=useAgentUILocale().pluginUpdates;
  const planRegion = useRef<HTMLElement>(null);
  useEffect(() => { if (plan) { planRegion.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); planRegion.current?.focus({ preventScroll: true }); } }, [plan?.id]);
  const status={online:messages.online,cached:messages.cached,unavailable:messages.onlineUnavailable,unconfigured:messages.onlineUnconfigured}[overview.status];
  const issueNames={multiple:messages.multipleVersions,creator:messages.requiresCreator,operator:messages.requiresOperator,node:messages.requiresNode,react:messages.requiresReact,missing:messages.missingPackage,downgrade:messages.noDowngrade,declaration:messages.declarationMismatch};
  const projectPackages = overview.packages.filter(pkg => pkg.scope === "project");
  const updates = projectPackages.filter(pkg => pkg.updateAvailable);
  const tools = overview.packages.filter(pkg => pkg.scope === "tools" && pkg.updateAvailable);
  const label = (name: string) => ({plugins: messages.componentsLabel, runtime: messages.runtimeLabel, core: messages.coreLabel, renderer: messages.rendererLabel, creator: "Creator", operator: messages.operatorLabel, "web-component": messages.embedLabel}[packageLabel(name)] ?? packageLabel(name));
  const date = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); };
  const packageRow = (pkg: PackageUpdateOverview["packages"][number]) => <article className="creator-package-row" key={pkg.name}>
    <div className="creator-package-heading">
      <strong title={pkg.name}>{label(pkg.name)}</strong>
      <span className="creator-package-version">{pkg.currentVersion??messages.notInstalled}{pkg.updateAvailable ? <> → <b>{pkg.targetVersion??messages.targetUnknown}</b></> : null}</span>
    </div>
    {pkg.summary.length ? <ul className="creator-release-notes">{pkg.summary.map((change,index)=><li key={index}>{change.kind==="breaking"?<strong className="creator-update-warning-text">{messages.breakingChange} · </strong>:null}{change.summary}</li>)}</ul> : null}
    {pkg.historyIncomplete?<p className="creator-update-muted" role="status">{messages.historyIncomplete}</p>:null}
    {pkg.history.length?<details className="creator-update-details"><summary>{messages.versionHistory}</summary><ol className="creator-version-history">{pkg.history.map((change,index)=><li key={index}><span>{change.version}</span><p>{change.summary}</p></li>)}</ol></details>:null}
    {pkg.updateAvailable&&(!overview.installationSupported||pkg.scope==="tools")?<p className="creator-update-muted">{messages.installationPending}</p>:null}
  </article>;
  return <section className="creator-package-overview" aria-label={messages.packageUpdates}>
    <div className="creator-update-connection">
      <div role="status"><span className="creator-update-online" data-online={overview.status==="online"}>{overview.status==="online" ? <CircleCheck aria-hidden="true"/> : <RefreshCw aria-hidden="true"/>}{status}</span><p className="creator-update-muted">{formatLocaleMessage(messages.checkedAt,date(overview.checkedAt))}</p>{overview.fetchedAt&&overview.status!=="online"?<p className="creator-update-muted">{formatLocaleMessage(messages.cachedAt,date(overview.fetchedAt))}</p>:null}</div>
      <Button size="icon-sm" variant="ghost" className="creator-update-refresh" disabled={working} aria-label={messages.refreshVersions} title={messages.refreshVersions} onClick={refresh}><RefreshCw aria-hidden="true" className={working?"cui:animate-spin":""}/></Button>
    </div>
    {overview.recovery ? <div className="creator-update-callout" data-tone="warning" role="alert"><p>{overview.recovery.state === "recovery-required" ? messages.packagesRecoveryRequired : messages.packageInterrupted}</p>{overview.recovery.state === "recovery-required" ? <Button size="sm" variant="outline" disabled={working} onClick={onRecover}>{messages.retryPackageRecovery}</Button> : null}</div> : null}
    <section className="creator-update-group" aria-label={messages.projectPackages}>
      <div className="creator-update-section-title"><h3><Package aria-hidden="true"/>{messages.projectPackages}</h3>{updates.length ? <span className="creator-update-count">{updates.length}</span> : null}</div>
      {updates.length ? <div className="creator-package-list">{updates.map(packageRow)}</div> : overview.status === "online" && overview.recommendedReleaseId && projectPackages.length > 0 && projectPackages.every(pkg => pkg.targetVersion) && !overview.blockedReleases.length ? <p className="creator-update-current"><Check aria-hidden="true"/>{messages.alreadyUpToDate}</p> : null}
      {overview.installationSupported && updates.length > 0 && !plan && !overview.recovery ? <Button className="creator-prepare-upgrade" disabled={working} onClick={onPlan}><ArrowUpRight aria-hidden="true"/>{messages.preparePackageUpgrade}</Button> : null}
    </section>
    {plan ? <section ref={planRegion} tabIndex={-1} className="creator-package-plan" aria-label={messages.confirmPackageUpgrade}>
      <div className="creator-update-plan-heading"><span className="creator-update-plan-icon"><ShieldCheck aria-hidden="true"/></span><div><h3>{messages.confirmPackageUpgrade}</h3><p>{messages.reviewPackagePlan}</p></div></div>
      <div className="creator-plan-packages">{plan.packages.filter(pkg => pkg.current !== pkg.target).map(pkg=><div className="creator-package-heading" key={pkg.name}><strong title={pkg.name}>{label(pkg.name)}</strong><span className="creator-package-version">{pkg.current} <ArrowRight aria-hidden="true"/> <b>{pkg.target}</b></span></div>)}</div>
      <div className="creator-update-callout"><ShieldCheck aria-hidden="true"/><p>{messages.packageUpgradeNotice}</p></div>
      <p className="creator-update-muted">{messages.upgradeValidationNotice}</p>
      <div className="creator-update-actions"><Button size="sm" variant="outline" disabled={working} onClick={onCancel}>{messages.skipUpdateCancel}</Button><Button size="sm" disabled={working} onClick={onExecute}>{working ? <RefreshCw aria-hidden="true" className="cui:animate-spin"/> : null}{messages.confirmPackageUpgrade}</Button></div>
    </section> : null}
    {tools.length ? <details className="creator-update-details creator-tools-packages"><summary>{messages.toolPackages}{tools.some(pkg=>pkg.updateAvailable) ? <span className="creator-update-count">{tools.filter(pkg=>pkg.updateAvailable).length}</span> : null}</summary><div className="creator-package-list">{tools.map(packageRow)}</div></details> : null}
    {overview.blockedReleases.length?<details className="creator-update-details creator-update-blocked"><summary>{messages.incompatibleVersions}</summary>{overview.blockedReleases.map(release=><div key={release.id}><ul>{release.issues.map((issue,index)=><li key={index}>{formatLocaleMessage(messages.compatibilityIssue,issueNames[issue.code],issue.name,issue.actual??messages.versionUntracked,issue.required)}</li>)}</ul></div>)}</details>:null}
  </section>;
}
