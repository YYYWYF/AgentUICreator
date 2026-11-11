import { useEffect, useRef } from "react";
import type { PackageUpdateOverview, PackageUpgradePlan, PackageUpgradeStage, UpdateInspection } from "@za38.03/agent-ui-creator/project/updates";
import { ArrowRight, CircleCheck, Package, RefreshCw, ShieldCheck } from "lucide-react";
import { useAgentUILocale, formatLocaleMessage } from "./i18n/locale.js";
import { creatorDisplayText } from "./product-presentation.js";
import { Button } from "./components/button.js";
import { UpdateReleaseNotes } from "./UpdateReleaseNotes.js";

const shortName = (name: string) => name.replace(/^@za38\.03\/agent-ui-/, "");
export const actionableBlockedReleases = (overview: PackageUpdateOverview) => overview.blockedReleases.filter(release => !release.issues.some(issue => issue.code === "downgrade"));
export const packageUpdateCount = (overview: PackageUpdateOverview) => Number(overview.packages.some(pkg => pkg.scope === "project" && pkg.updateAvailable)) + overview.packages.filter(pkg => pkg.scope === "tools" && pkg.updateAvailable).length;

export function PackageUpdatesOverview({ overview, sourcePlugins = [], pluginNames = {}, refresh, working, stage, plan, completed = [], toolsOnly = false, onPlan, onCancel, onExecute, onRecover }: {
  overview: PackageUpdateOverview; sourcePlugins?: UpdateInspection["plugins"]; refresh: () => void; working: boolean;
  pluginNames?: Record<string, string> | undefined;
  stage?: PackageUpgradeStage | "planning" | undefined; plan?: PackageUpgradePlan | null;
  completed?: PackageUpgradePlan["packages"]; toolsOnly?: boolean;
  onPlan?: () => void; onCancel?: () => void; onExecute?: () => void; onRecover?: () => void;
}) {
  const locale = useAgentUILocale();
  const messages = locale.pluginUpdates;
  const planRegion = useRef<HTMLElement>(null);
  useEffect(() => { if (plan) { planRegion.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); planRegion.current?.focus({ preventScroll: true }); } }, [plan?.id]);
  const label = (name: string) => ({ plugins: messages.componentsLabel, runtime: messages.runtimeLabel, core: messages.coreLabel, renderer: messages.rendererLabel, creator: "Creator", "web-component": messages.embedLabel }[shortName(name)] ?? shortName(name));
  const ownedIds = new Set(sourcePlugins.map(plugin => plugin.pluginId));
  const packages = overview.packages.filter(pkg => pkg.scope === "project");
  const updates = packages.filter(pkg => pkg.updateAvailable);
  const main = packages.find(pkg => pkg.name === "@za38.03/agent-ui-plugins") ?? updates[0] ?? packages[0];
  const pluginChange = plan?.packages.find(pkg => pkg.name.endsWith("-plugins") && pkg.current !== pkg.target);
  const blocked = actionableBlockedReleases(overview);
  const obsoleteOnly = overview.blockedReleases.length > 0 && blocked.length === 0 && !overview.recommendedReleaseId;
  const status = { online: messages.online, cached: messages.cached, unavailable: messages.onlineUnavailable, unconfigured: messages.onlineUnconfigured }[overview.status];
  const history = (pkg: PackageUpdateOverview["packages"][number]) => pkg.versionHistory ?? pkg.history;
  const otherPackages = packages.filter(pkg => pkg === main ? history(pkg).some(change => !change.pluginId) : pkg.updateAvailable || history(pkg).length > 0);
  const notes = (pkg: PackageUpdateOverview["packages"][number], historyOnly = false, pluginsOnly = false) => <UpdateReleaseNotes
    targetVersion={pkg.targetVersion ?? pkg.currentVersion ?? messages.versionUntracked}
    versions={pkg.versions ?? []} historyOnly={historyOnly}
    emptyMessage={pluginsOnly ? messages.noPluginVersionNotes : undefined}
    entries={history(pkg).filter(change => pluginsOnly ? !!change.pluginId && !ownedIds.has(change.pluginId) : pkg === main ? !change.pluginId : !change.pluginId || !ownedIds.has(change.pluginId)).map(change => ({
      version: change.version,
      ...(change.pluginId ? {pluginId: change.pluginId, pluginName: creatorDisplayText(pluginNames[change.pluginId] ?? change.pluginId)} : {}),
      content: <>{change.kind === "breaking" ? <strong className="creator-update-warning-text">{messages.breakingChange} · </strong> : null}{creatorDisplayText(change.summary)}</>,
    }))} />;
  const version = (pkg: PackageUpdateOverview["packages"][number]) => <p className="creator-package-version">{formatLocaleMessage(messages.currentVersion, pkg.currentVersion ?? messages.notInstalled)}</p>;
  if (toolsOnly) return <div className="creator-tools-packages">{overview.packages.filter(pkg => pkg.scope === "tools").map(pkg => <details key={pkg.name} className="creator-update-details creator-tool-record">
    <summary><span>Creator · {pkg.currentVersion ?? messages.notInstalled}</span><span className="creator-update-muted">{pkg.updateAvailable ? formatLocaleMessage(messages.newVersion, pkg.targetVersion) : overview.status === "online" && pkg.targetVersion ? messages.upToDate : messages.updateStatusUnavailable}</span></summary>
    {pkg.updateAvailable ? <><p className="creator-update-muted">{messages.toolUpdateInstructions}</p>{notes(pkg)}</> : notes(pkg, true)}
  </details>)}</div>;
  return <section className="creator-package-overview" aria-label={messages.packageUpdates}>
    <div className="creator-update-connection"><p className="creator-update-muted" role="status">{status}</p><Button size="sm" variant="outline" disabled={working} onClick={refresh}><RefreshCw className={working && !stage ? "cui:animate-spin" : ""} aria-hidden="true"/>{messages.checkForUpdates}</Button></div>
    {overview.recovery ? <div className="creator-update-callout" data-tone="warning" role="alert"><p>{overview.recovery.state === "recovery-required" ? messages.packagesRecoveryRequired : messages.packageInterrupted}</p>{overview.recovery.state === "recovery-required" ? <Button size="sm" variant="outline" disabled={working} onClick={onRecover}>{messages.retryPackageRecovery}</Button> : null}</div> : null}
    {main ? <article className="creator-official-plugins">
      <div className="creator-release-card-heading"><span className="creator-update-plan-icon"><Package aria-hidden="true"/></span><div><h3>{messages.componentsLabel}</h3>{completed.some(pkg => pkg.name === main.name && pkg.current !== pkg.target) ? null : version(main)}</div><span className="creator-update-plugin-status" data-current={overview.status === "online" && !!main.targetVersion && !updates.length}>{updates.length ? messages.updateAvailable : overview.status === "online" && main.targetVersion ? messages.upToDate : messages.updateStatusUnavailable}</span></div>
      {completed.some(pkg => pkg.current !== pkg.target) ? <div className="creator-update-success" role="status"><CircleCheck aria-hidden="true"/><div>{completed.filter(pkg => pkg.current !== pkg.target && pkg.name === main.name).map(pkg => <p key={pkg.name}>{formatLocaleMessage(messages.updatedTo, messages.componentsLabel, pkg.target)}</p>)}{completed.some(pkg => pkg.current !== pkg.target && pkg.name !== main.name) ? <p>{messages.dependenciesUpdated}</p> : null}<p className="creator-update-muted">{messages.packageUpdateComplete}</p></div></div> : null}
      {notes(main, !main.updateAvailable, true)}
      {updates.length && !main.updateAvailable ? <p>{messages.dependenciesOnly}</p> : null}
      {updates.some(pkg => pkg.summary.some(change => change.kind === "breaking" && (!change.pluginId || !ownedIds.has(change.pluginId)) && (!change.pluginId || pkg !== main || !change.versions.includes(pkg.targetVersion ?? "")))) ? <div className="creator-update-warning-text" role="note"><p>{messages.earlierBreakingChanges}</p><ul className="creator-release-notes">{updates.flatMap(pkg => pkg.summary.filter(change => change.kind === "breaking" && (!change.pluginId || !ownedIds.has(change.pluginId)) && (!change.pluginId || pkg !== main || !change.versions.includes(pkg.targetVersion ?? ""))).map(change => <li key={`${pkg.name}:${change.id}`}>{creatorDisplayText(change.summary)}</li>))}</ul></div> : null}
      {main.historyIncomplete ? <p className="creator-update-muted">{messages.historyIncomplete}</p> : null}
      {overview.installationSupported && updates.length > 0 && !plan && !overview.recovery ? <Button className="creator-prepare-upgrade" disabled={working} onClick={onPlan}>{stage === "planning" ? <><RefreshCw aria-hidden="true" className="cui:animate-spin"/>{messages.preparingUpdate}</> : main.updateAvailable ? messages.updateOfficialPlugins : messages.updateDependencies}</Button> : null}
      {main.updateAvailable ? <p className="creator-update-muted creator-update-includes">{messages.includesEarlierUpdates}</p> : null}
      {!overview.installationSupported && updates.length ? <p className="creator-update-muted">{messages.installationPending}</p> : null}
    </article> : null}
    {otherPackages.length ? <details className="creator-update-details creator-other-update-notes"><summary>{messages.otherPackageUpdates}</summary>{otherPackages.map(pkg => <section className="creator-other-package" key={pkg.name}><h4><code>{pkg.name}</code></h4>{version(pkg)}{notes(pkg)}</section>)}</details> : null}
    {plan ? <section ref={planRegion} tabIndex={-1} className="creator-package-plan" aria-label={pluginChange ? messages.confirmPackageUpgrade : messages.confirmUpdate}>
      <div className="creator-update-plan-heading"><ShieldCheck aria-hidden="true"/><h3>{pluginChange ? messages.confirmPackageUpgrade : messages.confirmUpdate}</h3></div>
      <div className="creator-plan-packages">{pluginChange ? <div className="creator-package-heading"><strong>{messages.componentsLabel}</strong><span className="creator-package-version">{pluginChange.current}<ArrowRight aria-hidden="true"/>{pluginChange.target}</span></div> : <p>{messages.dependenciesOnly}</p>}</div>
      <p>{messages.linkedDependenciesNotice}</p><p className="creator-update-muted">{messages.packageUpgradeNotice}</p>
      <details className="creator-update-details creator-dependency-details"><summary>{messages.viewLinkedDependencies}</summary>{plan.packages.filter(pkg => pkg.current !== pkg.target).map(pkg => {
        const changes = packages.find(item => item.name === pkg.name)?.summary.filter(change => !change.pluginId || !ownedIds.has(change.pluginId)) ?? [];
        return <section key={pkg.name}><p className="creator-update-muted"><code>{pkg.name}</code> · {pkg.current} → {pkg.target}</p>{changes.length ? <ul className="creator-release-notes">{changes.map((change, index) => <li key={`${change.id}:${index}`}>{creatorDisplayText(change.summary)}</li>)}</ul> : null}</section>;
      })}</details>
      <p className="creator-update-muted">{messages.upgradeValidationNotice}</p>
      {stage && stage !== "planning" ? <div className="creator-package-progress" role="status" aria-live="polite"><p><RefreshCw className="cui:animate-spin" aria-hidden="true"/>{messages[stage === "installing" ? "installingUpdate" : stage === "checking" ? "checkingProject" : "recoveringUpdate"]}</p><ol>{[messages.installDependencies, messages.checkProject, messages.finishUpdate].map((step, index) => <li key={step} data-active={index === (stage === "checking" ? 1 : 0)} data-done={stage === "checking" && index === 0}>{step}</li>)}</ol></div> : null}
      <div className="creator-update-actions"><Button size="sm" variant="outline" disabled={working} onClick={onCancel}>{messages.skipUpdateCancel}</Button><Button size="sm" disabled={working} onClick={onExecute}>{working ? <><RefreshCw aria-hidden="true" className="cui:animate-spin"/>{messages.updating}</> : messages.confirmUpdate}</Button></div>
    </section> : null}
    {obsoleteOnly ? <p className="creator-update-muted">{messages.noNewerRelease}</p> : null}
    {blocked.length ? <details className="creator-update-details creator-update-blocked"><summary>{messages.updatePreparationRequired}</summary>{blocked.map(release => <ul key={release.id} className="creator-release-notes">{release.issues.map((issue, index) => <li key={index}>{formatLocaleMessage(messages[({ creator: "updateCreatorRequired", node: "updateNodeRequired", react: "updateReactRequired", missing: "updateMissingPackage", multiple: "updateMultipleVersions", declaration: "updateDeclarationMismatch", downgrade: "noNewerRelease" } as const)[issue.code]], issue.required, label(issue.name))}</li>)}</ul>)}</details> : null}
  </section>;
}
