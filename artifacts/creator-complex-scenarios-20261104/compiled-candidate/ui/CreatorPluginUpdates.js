import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { PackageUpdatesOverview } from "./PackageUpdatesOverview.js";
import { creatorDisplayText } from "./product-presentation.js";
import { localizeCreatorPresentation, useAgentUILocale, DEFAULT_CREATOR_MESSAGES, formatLocaleMessage } from "./i18n/locale.js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUpCircle, RefreshCw, GitMerge, ShieldCheck } from "lucide-react";
import { Button } from "./components/button.js";
import { Alert, AlertDescription } from "./components/alert.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/card.js";
import { useCreatorRefresh } from "./creatorRefresh.js";
export class LocalUpdateNotificationStateStore {
    isDismissed(projectId, fingerprint) { try {
        return localStorage.getItem(`creator-plugin-update:${projectId}:${fingerprint}`) === "dismissed";
    }
    catch {
        return false;
    } }
    dismiss(projectId, fingerprint) { try {
        localStorage.setItem(`creator-plugin-update:${projectId}:${fingerprint}`, "dismissed");
    }
    catch { /* Browser storage is optional. */ } }
}
function getUpdateStatusLabels(localeMessages = DEFAULT_CREATOR_MESSAGES) { return { managed: localeMessages.pluginUpdates.readyToUpdate, customized: localeMessages.pluginUpdates.locallyModified, missing: localeMessages.pluginUpdates.notInstalled, conflict: localeMessages.pluginUpdates.conflictResolutionNeeded, unknown: localeMessages.pluginUpdates.reviewNeeded }; }
const updateStatusLabel = (status, localeMessages = DEFAULT_CREATOR_MESSAGES) => getUpdateStatusLabels(localeMessages)[status] ?? localeMessages.pluginUpdates.reviewNeeded;
const store = new LocalUpdateNotificationStateStore();
const availableCount = (result) => result.plugins.filter(plugin => plugin.updateAvailable).length + (result.packageUpdates?.packages.filter(pkg => pkg.updateAvailable).length ?? 0) + (result.packageUpdates?.recovery ? 1 : 0);
async function updateRequest(workspaceId, route, body = {}, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    const response = await fetch(`/__creator/updates/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
    const result = await response.json();
    if (!response.ok) {
        const errors = {
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
        };
        throw new Error(errors[result.error] ?? (typeof result.error === "string" && result.error.startsWith("PACKAGE_") ? localeMessages.pluginUpdates.packageOperationBlocked : result.error) ?? localeMessages.pluginUpdates.pluginUpdateFailed);
    }
    return result;
}
export function CreatorPluginUpdates({ workspaceId, busy, modelReady, checkRequest, notificationTarget, pageOpen: controlledPageOpen, onPageChange, onModelMerge }) {
    const localeMessages = useAgentUILocale();
    const [packagePlan, setPackagePlan] = useState(null);
    const [inspection, setInspection] = useState(null);
    const [localPageOpen, setLocalPageOpen] = useState(false);
    const pageOpen = controlledPageOpen ?? localPageOpen;
    const setPageOpen = (open) => { setLocalPageOpen(open); onPageChange(open); };
    const [banner, setBanner] = useState(false);
    const [working, setWorking] = useState(false);
    const [message, setMessage] = useState("");
    const [checkError, setCheckError] = useState("");
    const [plan, setPlan] = useState(null);
    const [planTarget, setPlanTarget] = useState(null);
    const planRegion = useRef(null);
    const [merging, setMerging] = useState(false);
    const [mergeFiles, setMergeFiles] = useState([]);
    const generation = useRef(0);
    const active = useRef(true);
    const lastCheckRequest = useRef(checkRequest);
    useCreatorRefresh(data => {
        if (data.projectId !== workspaceId || !data.updates || working)
            return;
        generation.current++;
        setInspection(data.updates);
        setCheckError("");
        setBanner(availableCount(data.updates) > 0 && !store.isDismissed(workspaceId, data.updates.fingerprint));
    });
    const check = async (manual) => {
        const requestGeneration = ++generation.current;
        if (manual) {
            setWorking(true);
            setMessage("");
        }
        try {
            const result = await updateRequest(workspaceId, "check", { refresh: manual }, localeMessages);
            if (generation.current !== requestGeneration)
                return;
            setInspection(result);
            setCheckError("");
            const count = availableCount(result);
            if (manual) {
                if (count)
                    setPageOpen(true);
                else
                    setMessage(result.packageUpdates && result.packageUpdates.status !== "online" ? localeMessages.pluginUpdates.metadataUnavailable : result.packageUpdates?.blockedReleases.length ? localeMessages.pluginUpdates.compatibilityBlocked : localeMessages.pluginUpdates.alreadyUpToDate);
            }
            setBanner(count > 0 && !store.isDismissed(workspaceId, result.fingerprint));
        }
        catch (error) {
            if (generation.current === requestGeneration) {
                setInspection(null);
                setBanner(false);
                setCheckError(formatLocaleMessage(localeMessages.pluginUpdates.couldNotCheckUpdates, error instanceof Error ? error.message : String(error)));
            }
        }
        finally {
            if (generation.current === requestGeneration)
                setWorking(false);
        }
    };
    useEffect(() => { active.current = true; setPackagePlan(null); void check(false); return () => { active.current = false; generation.current++; }; }, [workspaceId]);
    useEffect(() => { if (checkRequest !== lastCheckRequest.current) {
        lastCheckRequest.current = checkRequest;
        void check(true);
    } }, [checkRequest]);
    useEffect(() => () => onPageChange(false), [onPageChange]);
    useEffect(() => { if (pageOpen)
        void check(false); }, [pageOpen]);
    const totalUpdates = inspection ? availableCount(inspection) : 0;
    const updates = inspection?.plugins.filter(plugin => plugin.updateAvailable) ?? [];
    const operation = async (run) => {
        if (!active.current || working || busy)
            return;
        setWorking(true);
        setMessage("");
        try {
            await run();
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        }
        finally {
            setWorking(false);
        }
    };
    const createPlan = (pluginIds, target) => operation(async () => {
        setPlanTarget(target);
        const result = await updateRequest(workspaceId, "plan", { pluginIds, releaseVersion: inspection.releaseVersion }, localeMessages);
        setPlan(result);
        setMerging(false);
        setMergeFiles([]);
    });
    const finish = async (route) => {
        await updateRequest(workspaceId, route, { planId: plan.id, confirmed: true }, localeMessages);
        setPlan(null);
        setPlanTarget(null);
        setMerging(false);
        setMergeFiles([]);
        await check(false);
        setMessage(localeMessages.pluginUpdates.pluginUpdatesCompleteValidationPassed);
    };
    useEffect(() => {
        if (!plan || !pageOpen)
            return;
        planRegion.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        planRegion.current?.focus({ preventScroll: true });
    }, [plan, pageOpen]);
    const planContent = plan ? _jsxs("section", { className: "creator-upgrade-plan", ref: planRegion, tabIndex: -1, role: "region", "aria-label": localeMessages.pluginUpdates.updatePlan, children: [_jsxs("h3", { className: "creator-source-plan-title", children: [_jsx(GitMerge, { "aria-hidden": "true" }), merging ? localeMessages.pluginUpdates.reviewSourceMerge : plan.requiresMerge ? localeMessages.pluginUpdates.mergeSourceTitle : localeMessages.pluginUpdates.confirmTheseUpdates] }), _jsxs("div", { className: "cui:flex cui:flex-col cui:gap-3 cui:text-xs", children: [plan.kind !== "owned-source" && plan.items.length ? _jsxs("details", { className: "creator-update-details", children: [_jsx("summary", { children: localeMessages.pluginUpdates.sourceAffectedComponents }), _jsx("ul", { className: "cui:list-disc cui:space-y-1 cui:pl-4", children: plan.items.map(item => _jsxs("li", { children: [creatorDisplayText(item.itemId), item.targetVersion ? formatLocaleMessage(localeMessages.pluginUpdates.message, item.currentVersion ?? localeMessages.pluginUpdates.notInstalledUntracked, item.targetVersion) : null] }, creatorDisplayText(item.itemId))) })] }) : null, _jsxs("div", { className: "creator-update-callout", children: [_jsx(ShieldCheck, { "aria-hidden": "true" }), _jsx("p", { children: plan.requiresMerge ? localeMessages.pluginUpdates.sourceMergePreservation : localeMessages.pluginUpdates.sourceSyncPreservation })] }), plan.compatibility !== "compatible" ? _jsx(Alert, { variant: "destructive", children: _jsx(AlertDescription, { children: localeMessages.pluginUpdates.upgradeCreatorFirst }) }) : null, plan.issues.map((issue, index) => _jsx(Alert, { variant: "destructive", children: _jsx(AlertDescription, { children: creatorDisplayText(issue) }) }, index)), !merging ? _jsx("p", { children: plan.requiresMerge ? localeMessages.pluginUpdates.sourceMergeConfirmation : localeMessages.pluginUpdates.sourceSyncConfirmation }) : null, _jsxs("div", { className: "creator-update-actions", hidden: merging, children: [_jsx(Button, { size: "sm", variant: "outline", disabled: working || busy, onClick: () => { setPlan(null); setPlanTarget(null); setMerging(false); }, children: localeMessages.pluginUpdates.sourceNotNow }), !plan.blocked && !merging && !plan.requiresMerge ? _jsx(Button, { size: "sm", disabled: working || busy, onClick: () => void operation(() => finish("execute")), children: localeMessages.pluginUpdates.confirmUpdate }) : null, !plan.blocked && !merging && plan.requiresMerge ? _jsxs(_Fragment, { children: [_jsx(Button, { size: "sm", disabled: working || busy || !modelReady, onClick: () => void operation(async () => { const result = await updateRequest(workspaceId, "merge", { planId: plan.id, confirmed: true }, localeMessages); if (!active.current)
                                            return; setMerging(true); setMergeFiles(result.files); setPageOpen(false); onModelMerge(result.prompt); }), children: localeMessages.pluginUpdates.mergeWithModel }), _jsx(Button, { size: "sm", variant: "outline", disabled: working || busy, onClick: () => void operation(async () => {
                                            try {
                                                const result = await updateRequest(workspaceId, "merge", { planId: plan.id, confirmed: true }, localeMessages);
                                                setMergeFiles(result.files);
                                            }
                                            catch {
                                                const result = await updateRequest(workspaceId, "manual", { planId: plan.id, confirmed: true }, localeMessages);
                                                setMergeFiles(result.files.map(path => ({ path })));
                                            }
                                            setMerging(true);
                                        }), children: localeMessages.pluginUpdates.mergeManually })] }) : null] }), merging ? _jsxs("div", { className: "cui:flex cui:flex-col cui:gap-3", children: [_jsx("p", { children: localeMessages.pluginUpdates.sourceReviewConfirmation }), _jsxs("details", { className: "creator-update-details creator-source-diff", children: [_jsx("summary", { children: formatLocaleMessage(localeMessages.pluginUpdates.sourceCodeComparison, mergeFiles.length) }), mergeFiles.map(file => _jsxs("details", { className: "creator-source-diff-file", children: [_jsx("summary", { children: creatorDisplayText(file.path) }), file.base !== undefined ? _jsxs(_Fragment, { children: [_jsx("h4", { children: localeMessages.pluginUpdates.sourceOriginal }), _jsx("pre", { children: creatorDisplayText(file.base ?? localeMessages.pluginUpdates.fileDoesNotExist) })] }) : null, file.local !== undefined ? _jsxs(_Fragment, { children: [_jsx("h4", { children: localeMessages.pluginUpdates.sourceLocal }), _jsx("pre", { children: creatorDisplayText(file.local ?? localeMessages.pluginUpdates.fileDoesNotExist) })] }) : null, file.target !== undefined ? _jsxs(_Fragment, { children: [_jsx("h4", { children: localeMessages.pluginUpdates.sourceNew }), _jsx("pre", { children: creatorDisplayText(file.target ?? localeMessages.pluginUpdates.fileDoesNotExist) })] }) : _jsx("p", { children: localeMessages.pluginUpdates.historicalReleaseUnavailableUseTheChangelogAboveTo })] }, creatorDisplayText(file.path)))] }), _jsxs("div", { className: "creator-update-actions", children: [_jsx(Button, { size: "sm", variant: "outline", disabled: working || busy, onClick: () => void check(true), children: localeMessages.pluginUpdates.recheck }), _jsx(Button, { size: "sm", disabled: working || busy, onClick: () => void operation(() => finish("adopt")), children: localeMessages.pluginUpdates.mergeCompleteValidateAndAdvanceBaseline })] })] }) : null] })] }) : null;
    const planFeedback = _jsxs(_Fragment, { children: [working && !plan ? _jsxs("p", { className: "cui:flex cui:items-center cui:gap-2 cui:text-xs cui:text-muted-foreground", role: "status", children: [_jsx(RefreshCw, { "aria-hidden": "true", className: "cui:size-3.5 cui:animate-spin" }), localeMessages.pluginUpdates.checkingUpdateContents] }) : null, message ? _jsx(Alert, { role: "status", children: _jsx(AlertDescription, { children: localizeCreatorPresentation(message, localeMessages) }) }) : null] });
    const notification = banner && !pageOpen ? _jsx("div", { className: "creator-update-banner", role: "status", children: _jsxs(Button, { size: "sm", variant: "ghost", className: "creator-update-entry", "aria-label": localeMessages.pluginUpdates.viewUpdates, title: formatLocaleMessage(inspection?.packageUpdates ? localeMessages.pluginUpdates.availableUpdates : localeMessages.pluginUpdates.pluginsCanBeUpdated, totalUpdates), onClick: () => setPageOpen(true), children: [_jsx(ArrowUpCircle, { "aria-hidden": "true" }), _jsx("span", { "aria-hidden": "true", children: totalUpdates }), _jsx("span", { className: "cui:sr-only", children: inspection?.packageUpdates ? formatLocaleMessage(localeMessages.pluginUpdates.availableUpdates, totalUpdates) : `${localeMessages.pluginUpdates.thereAre} ${updates.length} ${localeMessages.pluginUpdates.pluginsWithUpdates}` })] }) }) : null;
    return _jsxs("section", { className: "creator-plugin-updates creator-ui-scope", "aria-label": localeMessages.pluginUpdates.pluginUpdates, "aria-busy": working, children: [notificationTarget ? createPortal(notification, notificationTarget) : notification, working && !pageOpen ? _jsxs("p", { className: "cui:flex cui:items-center cui:gap-2 cui:py-2 cui:text-xs cui:text-muted-foreground", role: "status", children: [_jsx(RefreshCw, { "aria-hidden": "true", className: "cui:size-3.5 cui:animate-spin" }), localeMessages.pluginUpdates.checkingUpdates] }) : null, message && (planTarget === null || !pageOpen) ? _jsx(Alert, { className: "cui:my-2", role: "status", children: _jsx(AlertDescription, { children: localizeCreatorPresentation(message, localeMessages) }) }) : null, pageOpen ? _jsxs("div", { className: "creator-update-page cui:space-y-3", "aria-busy": working, children: [_jsxs("header", { className: "creator-update-page-heading", children: [_jsx(Button, { size: "icon-sm", variant: "ghost", "aria-label": localeMessages.pluginUpdates.back, onClick: () => setPageOpen(false), children: _jsx(ArrowLeft, { "aria-hidden": "true" }) }), _jsxs("div", { children: [_jsx("h2", { children: inspection?.packageUpdates ? localeMessages.pluginUpdates.updateCenter : localeMessages.pluginUpdates.pluginUpdates }), _jsx("p", { children: localeMessages.pluginUpdates.updateCenterDescription })] })] }), _jsxs("div", { className: "creator-update-page-meta", children: [_jsx("p", { className: "cui:text-xs cui:text-muted-foreground", children: !inspection || inspection.packageUpdates && inspection.packageUpdates.status !== "online" ? working ? localeMessages.pluginUpdates.checkingUpdates : localeMessages.pluginUpdates.updateStatusUnavailable : inspection.packageUpdates ? formatLocaleMessage(localeMessages.pluginUpdates.availableUpdates, totalUpdates) : `${updates.length} ${localeMessages.pluginUpdates.pluginsWithUpdates}` }), banner ? _jsx(Button, { size: "xs", variant: "ghost", "aria-label": localeMessages.pluginUpdates.closePluginUpdateNotice, onClick: () => { store.dismiss(workspaceId, inspection.fingerprint); setBanner(false); setPageOpen(false); }, children: localeMessages.pluginUpdates.dismissForNow }) : null] }), inspection?.packageUpdates ? _jsx(PackageUpdatesOverview, { overview: inspection.packageUpdates, working: working || busy, refresh: () => void check(true), plan: packagePlan, onPlan: () => void operation(async () => { setPackagePlan(await updateRequest(workspaceId, "packages/plan", {}, localeMessages)); }), onCancel: () => setPackagePlan(null), onExecute: () => void operation(async () => { const result = await updateRequest(workspaceId, "packages/execute", { planId: packagePlan.id, confirmed: true }, localeMessages); setPackagePlan(null); await check(false); setMessage(localeMessages.pluginUpdates[result.status === "installed" ? "packagesInstalled" : result.status === "restored" ? "packagesRestored" : "packagesRecoveryRequired"]); }), onRecover: () => void operation(async () => { const result = await updateRequest(workspaceId, "packages/recover", { planId: inspection.packageUpdates.recovery.id, confirmed: true }, localeMessages); await check(false); setMessage(localeMessages.pluginUpdates[result.status === "restored" ? "packagesRestored" : "packagesRecoveryRequired"]); }) }) : null, checkError ? _jsx(Alert, { variant: "destructive", role: "alert", children: _jsx(AlertDescription, { children: checkError }) }) : null, inspection && inspection.compatibility !== "compatible" ? _jsx(Alert, { variant: "destructive", children: _jsx(AlertDescription, { children: localeMessages.pluginUpdates.thisCreatorVersionCannotInstallTheUpdateUpgrade }) }) : null, planTarget === "all" ? _jsxs(_Fragment, { children: [planFeedback, planContent] }) : null, updates.length ? _jsxs("div", { className: "creator-update-source-heading", children: [_jsxs("div", { children: [_jsxs("h3", { children: [_jsx(GitMerge, { "aria-hidden": "true" }), localeMessages.pluginUpdates.sourceSection] }), _jsx("p", { children: localeMessages.pluginUpdates.sourceSectionDescription })] }), updates.length > 1 && !updates.some(plugin => plugin.delivery === "source-owned") ? _jsx(Button, { size: "sm", variant: "outline", disabled: working || busy || !!plan, onClick: () => void createPlan(updates.map(plugin => plugin.pluginId), "all"), children: localeMessages.pluginUpdates.updateAll }) : null] }) : null, updates.map(plugin => _jsxs(Card, { className: "creator-update-plugin-card cui:gap-3 cui:py-4", children: [_jsxs(CardHeader, { className: "creator-update-plugin-heading cui:gap-1 cui:px-4", children: [_jsx(CardTitle, { className: "cui:text-sm", children: creatorDisplayText(plugin.name) }), plugin.delivery === "source-owned" ? _jsx("p", { className: "creator-source-origin", children: localeMessages.pluginUpdates.sourceOwned }) : null, _jsxs(CardDescription, { className: "cui:text-xs", children: [plugin.currentVersion ?? localeMessages.pluginUpdates.versionUntracked, " \u2192 ", plugin.targetVersion] }), _jsx("span", { className: "creator-update-plugin-status", "data-customized": plugin.status === "customized", children: updateStatusLabel(plugin.status, localeMessages) })] }), _jsxs(CardContent, { className: "cui:flex cui:flex-col cui:gap-3 cui:px-4 cui:text-xs", children: [plugin.changelog.map(({ version, entry }) => _jsxs("div", { children: [_jsxs("strong", { children: [version, " \u00B7 ", creatorDisplayText(entry.summary)] }), _jsx("ul", { className: "cui:my-2 cui:list-disc cui:space-y-1 cui:pl-4 cui:text-muted-foreground", children: entry.changes.map((change, index) => _jsx("li", { children: creatorDisplayText(change) }, index)) })] }, version)), plugin.status === "customized" && planTarget !== plugin.pluginId ? _jsx("p", { className: "creator-update-local-notice", children: localeMessages.pluginUpdates.localSourceChangesDetectedTheyCannotBeSafely }) : null, _jsx(Button, { hidden: planTarget === plugin.pluginId, size: "sm", variant: "outline", className: "creator-update-plan-entry", disabled: working || busy || !!plan, onClick: () => void createPlan([plugin.pluginId], plugin.pluginId), children: plugin.delivery === "source-owned" ? localeMessages.pluginUpdates.syncImplementation : localeMessages.pluginUpdates.viewUpdateContents }), planTarget === plugin.pluginId ? _jsxs(_Fragment, { children: [planFeedback, planContent] }) : null] })] }, plugin.pluginId))] }) : null] });
}
//# sourceMappingURL=CreatorPluginUpdates.js.map