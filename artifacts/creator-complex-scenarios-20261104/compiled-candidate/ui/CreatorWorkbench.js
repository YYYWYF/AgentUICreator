import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { MessageSchema } from "@ag-ui/core/schemas";
import { creatorDisplayValue } from "./product-presentation.js";
import { parseCreatorCommand } from "../commands/parser.js";
import { buildCompatibilityProjectRequest, executeCreatorCommand } from "./workspaceClient.js";
import { useCreatorCommandState } from "./commands/useCreatorCommandState.js";
import { confirmPluginEnablement } from "./commands/confirmPluginEnablement.js";
import { CreatorCommandMenu } from "./commands/CreatorCommandMenu.js";
import { useRef as useLocaleMessagesRef } from "react";
import { localizeCreatorPresentation, CreatorLocaleProvider, useAgentUILocale, DEFAULT_CREATOR_MESSAGES, formatLocaleMessage } from "./i18n/locale.js";
import { creatorRunOutcomeText } from "./run-outcome.js";
import { creatorRuntimeErrorMessage } from "./creatorRuntimeError.js";
import { AgentConnectionPanel, CONNECTION_CHANGED, readAgentConnection } from "./AgentConnectionPanel.js";
import { publishCreatorRefresh, readRefreshJson } from "./creatorRefresh.js";
import { memo, useCallback, useEffect, useRef, useState, } from "react";
import ReactMarkdown from "react-markdown";
import { AlertCircle, ArrowLeft, ArrowUp, Bot, ChevronDown, FlaskConical, FolderOpen, PanelsTopLeft, Plug, RotateCcw, RefreshCw, Settings, Sparkles, Square, UserRound, X } from "lucide-react";
import { Button } from "./components/button.js";
import { Badge } from "./components/badge.js";
import { Input } from "./components/input.js";
import { Textarea } from "./components/textarea.js";
import { Popover, PopoverContent, PopoverTrigger } from "./components/popover.js";
import remarkGfm from "remark-gfm";
import "./creator-workbench.css";
import { CreatorAgentClient } from "../agent/CreatorAgentClient.js";
import { parseCreatorQuestion } from "../agent/creatorInterruptTypes.js";
import { CreatorQuestionCard } from "./CreatorQuestionCard.js";
import {} from "../workspace/types.js";
import { resolveCreatorDebugMode } from "./creatorDebug.js";
import { CreatorProjectSetup, setupIssueMessage } from "./setup/CreatorProjectSetup.js";
import { CreatorProjectIntegrationGuide } from "./setup/CreatorProjectIntegrationGuide.js";
import { CreatorPluginUpdates } from "./CreatorPluginUpdates.js";
import { MockServicePanel } from "./MockServicePanel.js";
import { canInitializeCreatorProject, createEmptyCreatorSetupDraft, isCreatorSetupValidationUsable, isSetupRequestCurrent, shouldRefreshAfterInitializeError } from "./setup/creatorSetupState.js";
import { CreatorWorkspaceRequestError, chooseWorkspaceProject, clearWorkspaceProject, getWorkspaceSetup, getWorkspaceState, initializeWorkspaceProjectRequest, refreshWorkspaceProject, selectWorkspaceProject, validateWorkspaceSetup } from "./workspaceClient.js";
import { creatorStageTitle, interruptCreatorStage, isCreatorStageName, parseCreatorStepMetadata, projectCreatorIntentStage, reconcileCreatorStagesFromRunResult, } from "./creatorStageProjection.js";
import { classifyCreatorReceiptPresentation, shouldPresentStage } from "./creatorConversationPresentation.js";
const STORAGE_KEY = "agent-ui-creator-conversation";
const WORKSPACE_PATH_STORAGE_KEY = "agent-ui-creator-selected-project-root";
const conversationKey = (workspaceId) => `${STORAGE_KEY}:${workspaceId}`;
const activeRunKey = (workspaceId) => `${STORAGE_KEY}:active-run:${workspaceId}`;
function rememberedWorkspacePath() {
    try {
        return localStorage.getItem(WORKSPACE_PATH_STORAGE_KEY);
    }
    catch {
        return null;
    }
}
function rememberWorkspacePath(path) {
    try {
        if (path === null)
            localStorage.removeItem(WORKSPACE_PATH_STORAGE_KEY);
        else
            localStorage.setItem(WORKSPACE_PATH_STORAGE_KEY, path);
    }
    catch { /* The project remains usable without browser storage. */ }
}
const CREATOR_PANEL_MIN_WIDTH = 280;
const CREATOR_PANEL_MAX_WIDTH = 720;
const CREATOR_PREVIEW_MIN_WIDTH = 320;
const CREATOR_PANEL_KEYBOARD_STEP = 16;
function CreatorSettings({ busy, ready, onCheckUpdates, onAgent, onMock }) {
    const localeMessages = useAgentUILocale();
    const [open, setOpen] = useState(false);
    const [portalContainer, setPortalContainer] = useState(null);
    const anchor = useRef(null);
    useEffect(() => { setPortalContainer(anchor.current?.closest(".creator-panel") ?? null); }, []);
    return (_jsx("div", { className: "creator-settings creator-ui-scope", ref: anchor, children: _jsxs(Popover, { open: open, onOpenChange: setOpen, children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "icon-sm", "aria-label": localeMessages.creatorWorkbench.settings, title: localeMessages.creatorWorkbench.settings, children: _jsx(Settings, { "aria-hidden": "true" }) }) }), _jsxs(PopoverContent, { container: portalContainer, align: "end", className: "creator-settings-menu", "aria-label": localeMessages.creatorWorkbench.settings, children: [_jsxs(Button, { variant: "ghost", size: "sm", disabled: !ready, onClick: () => { setOpen(false); onAgent(); }, children: [_jsx(Plug, { "aria-hidden": "true" }), localeMessages.creatorWorkbench.connectAgent] }), _jsxs(Button, { variant: "ghost", size: "sm", onClick: () => { setOpen(false); onMock(); }, children: [_jsx(FlaskConical, { "aria-hidden": "true" }), localeMessages.creatorWorkbench.demosAndReplay] }), _jsxs(Button, { variant: "ghost", size: "sm", disabled: busy || !ready, onClick: () => { setOpen(false); onCheckUpdates(); }, children: [_jsx(RefreshCw, { "aria-hidden": "true" }), localeMessages.creatorWorkbench.pluginUpdates] })] })] }) }));
}
function clampCreatorPanelWidth(width) {
    const availableWidth = Math.max(CREATOR_PANEL_MIN_WIDTH, window.innerWidth - CREATOR_PREVIEW_MIN_WIDTH);
    return Math.min(Math.max(width, CREATOR_PANEL_MIN_WIDTH), Math.min(CREATOR_PANEL_MAX_WIDTH, availableWidth));
}
const CreatorWorkbenchPreview = memo(function CreatorWorkbenchPreview({ children, threadId, workspaceId, }) {
    const localeMessages = useAgentUILocale();
    return (_jsx("section", { className: "creator-workbench-preview", "aria-label": localeMessages.creatorWorkbench.agentFrontendPreview, children: typeof children === "function" ? children({ threadId, workspaceId }) : children }));
});
function presentConversationItems(items, debug) {
    const presented = [];
    for (const original of items) {
        // Questions retain action IDs and submitted values; their labels are projected in the card.
        // User text and stored/model context are preserved verbatim.
        const item = original.kind === "question" || (original.kind === "message" && original.role === "user")
            ? original : creatorDisplayValue(original);
        if (item.kind === "stage" && !shouldPresentStage(item, debug))
            continue;
        if (item.kind !== "tool") {
            presented.push(item);
            continue;
        }
        const previous = presented.at(-1);
        if (previous?.kind === "tool-group")
            previous.activities.push(item);
        else
            presented.push({ kind: "tool-group", id: `tools-${item.id}`, activities: [item] });
    }
    return presented;
}
const hasPendingCreatorQuestion = (items) => items.some(item => item.kind === "question" && (item.status === "pending" || item.status === "submitting"));
const questionContextIsGone = (code) => code === "CREATOR_INTERRUPT_NOT_FOUND" || code === "CREATOR_INTERRUPT_CONTEXT_INVALID" || code === "CREATOR_RUN_STOPPED";
function storedRun(workspaceId, threadId, messages) {
    try {
        const value = JSON.parse(sessionStorage.getItem(activeRunKey(workspaceId)) ?? "null");
        if (isRecord(value) && value.threadId === threadId && typeof value.runId === "string" && value.runId) {
            return { runId: value.runId, threadId, items: parsedItems(value.items, messages), agentMessages: parsedAgentMessages(value.agentMessages) };
        }
    }
    catch { /* A corrupt browser record cannot authorize another execution. */ }
    return undefined;
}
function getRoleLabels(localeMessages = DEFAULT_CREATOR_MESSAGES) {
    return {
        user: localeMessages.creatorWorkbench.user,
        assistant: localeMessages.creatorWorkbench.creator,
        error: localeMessages.creatorWorkbench.error,
    };
}
function getFileStatusLabels(localeMessages = DEFAULT_CREATOR_MESSAGES) {
    return {
        created: localeMessages.creatorWorkbench.created,
        modified: localeMessages.creatorWorkbench.modified,
        deleted: localeMessages.creatorWorkbench.deleted,
    };
}
function getValidationStatusLabels(localeMessages = DEFAULT_CREATOR_MESSAGES) {
    return {
        passed: localeMessages.creatorWorkbench.passed,
        failed: localeMessages.creatorWorkbench.failed,
    };
}
function getVerificationCheckStatusLabels(localeMessages = DEFAULT_CREATOR_MESSAGES) {
    return {
        passed: localeMessages.creatorWorkbench.passed,
        failed: localeMessages.creatorWorkbench.failed,
        stale: localeMessages.creatorWorkbench.runtimeHasNotObservedTheUpdate,
        unavailable: localeMessages.creatorWorkbench.runtimeTemporarilyUnavailable,
    };
}
function verificationCheckStatusLabel(check, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    if (check.id === "operation-postcondition") {
        if (check.status === "unavailable")
            return localeMessages.creatorWorkbench.requestOutcomeUnconfirmed;
        if (check.status === "failed")
            return localeMessages.creatorWorkbench.requestTargetNotSatisfied;
    }
    if (check.id === "static-validation") {
        if (check.status === "unavailable")
            return localeMessages.creatorWorkbench.staticValidationIncomplete;
        if (check.status === "failed")
            return localeMessages.creatorWorkbench.staticValidationFailed;
    }
    return getVerificationCheckStatusLabels(localeMessages)[check.status];
}
function getVerificationStatusLabels(localeMessages = DEFAULT_CREATOR_MESSAGES) {
    return {
        "not-run": localeMessages.creatorWorkbench.completionVerificationNotPerformed,
        "changed-and-statically-verified": localeMessages.creatorWorkbench.changesPassedStaticValidation,
        "changed-and-verified": localeMessages.creatorWorkbench.changesVerified,
        "changed-unverified": localeMessages.creatorWorkbench.changesCommittedCompletionVerificationUnconfirmed,
        "no-project-change": localeMessages.creatorWorkbench.projectUnchanged,
        "decision-no-project-change": localeMessages.creatorWorkbench.endedByUserDecisionProjectUnchanged,
        failed: localeMessages.creatorWorkbench.completionVerificationFailed,
    };
}
function getToolStatusLabels(localeMessages = DEFAULT_CREATOR_MESSAGES) {
    return {
        preparing: localeMessages.creatorWorkbench.preparing,
        running: localeMessages.creatorWorkbench.executing,
        completed: localeMessages.creatorWorkbench.completed,
        failed: localeMessages.creatorWorkbench.executionFailed,
    };
}
const creatorStageNames = [
    "creator.grounding",
    "creator.resolve",
    "creator.productized-operation",
];
const markdownPlugins = [remarkGfm];
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function isCreatorRunReceipt(value) {
    if (!isRecord(value) ||
        !Array.isArray(value.files) ||
        !Array.isArray(value.validations)) {
        return false;
    }
    return (value.files.every((file) => isRecord(file) &&
        typeof file.path === "string" &&
        (file.status === "created" ||
            file.status === "modified" ||
            file.status === "deleted") &&
        typeof file.diff === "string" &&
        typeof file.truncated === "boolean") &&
        value.validations.every((validation) => isRecord(validation) &&
            typeof validation.command === "string" &&
            (validation.status === "passed" || validation.status === "failed") &&
            (typeof validation.exitCode === "number" ||
                validation.exitCode === null) &&
            typeof validation.output === "string" &&
            typeof validation.truncated === "boolean" &&
            (validation.revision === undefined ||
                typeof validation.revision === "number")) &&
        (value.verification === undefined ||
            (isRecord(value.verification) &&
                (value.verification.status === "not-run" ||
                    value.verification.status === "changed-and-statically-verified" ||
                    value.verification.status === "changed-and-verified" ||
                    value.verification.status === "changed-unverified" ||
                    value.verification.status === "no-project-change" ||
                    value.verification.status === "decision-no-project-change" ||
                    value.verification.status === "failed") &&
                typeof value.verification.projectRevision === "number" &&
                typeof value.verification.auditAttempts === "number" &&
                (value.verification.verificationMode === undefined ||
                    value.verification.verificationMode === "static_only" ||
                    value.verification.verificationMode === "static_and_runtime") &&
                (value.verification.runtimeStatus === undefined ||
                    value.verification.runtimeStatus === "not-run" ||
                    value.verification.runtimeStatus === "passed" ||
                    value.verification.runtimeStatus === "stale" ||
                    value.verification.runtimeStatus === "unavailable" ||
                    value.verification.runtimeStatus === "failed") &&
                Array.isArray(value.verification.checks) &&
                value.verification.checks.every((check) => isRecord(check) &&
                    typeof check.id === "string" &&
                    (check.status === "passed" ||
                        check.status === "failed" ||
                        check.status === "stale" ||
                        check.status === "unavailable") &&
                    typeof check.evidence === "string"))) &&
        (value.pluginDeliveries === undefined ||
            (Array.isArray(value.pluginDeliveries) && value.pluginDeliveries.every((report) => isRecord(report) && typeof report.pluginId === "string" &&
                typeof report.projectRevision === "number" &&
                isRecord(report.decision) && typeof report.decision.type === "string" &&
                isRecord(report.authorization) && typeof report.authorization.status === "string" &&
                isRecord(report.delivery) &&
                (typeof report.delivery.status === "string" && ["planning", "created", "registered", "composed", "verified", "statically-verified", "completed", "blocked"].includes(report.delivery.status)) &&
                typeof report.delivery.lastSuccessfulStage === "string" &&
                Array.isArray(report.delivery.blockers) && report.delivery.blockers.every((item) => typeof item === "string") &&
                Array.isArray(report.delivery.instanceIds) && report.delivery.instanceIds.every((item) => typeof item === "string") &&
                isRecord(report.delivery.stages) && Object.values(report.delivery.stages).every((item) => typeof item === "boolean") &&
                isRecord(report.verification) && Object.values(report.verification).every((item) => typeof item === "string")))) &&
        (value.diagnosticLog === undefined ||
            (isRecord(value.diagnosticLog) &&
                Object.keys(value.diagnosticLog).sort().join(",") === "format,path" &&
                value.diagnosticLog.format === "jsonl" &&
                typeof value.diagnosticLog.path === "string")) &&
        (value.transaction === undefined ||
            (isRecord(value.transaction) &&
                typeof value.transaction.runId === "string" &&
                typeof value.transaction.undoable === "boolean" &&
                (value.transaction.undone === undefined || typeof value.transaction.undone === "boolean") &&
                (value.transaction.reapplyable === undefined || typeof value.transaction.reapplyable === "boolean") &&
                (value.transaction.reapplied === undefined || typeof value.transaction.reapplied === "boolean"))));
}
function receiptFromRunResult(value, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    if (!isRecord(value) || value.receipt === undefined) {
        return undefined;
    }
    if (!isCreatorRunReceipt(value.receipt)) {
        throw new Error(localeMessages.creatorWorkbench.creatorReturnedAnInvalidRunReceipt);
    }
    return value.receipt;
}
function creatorAgentMessages(messages) {
    return messages.flatMap((message) => {
        if (message.role === "user") {
            return [{ id: message.id, role: "user", content: message.content }];
        }
        if (message.role === "assistant") {
            return [{ id: message.id, role: "assistant", content: message.content }];
        }
        return [];
    });
}
function storedItem(value, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    if (!isRecord(value) || typeof value.id !== "string") {
        return undefined;
    }
    if (value.kind === "command" && typeof value.commandId === "string" && ["running", "completed", "failed", "integration-required", "agent-required", "cancelled"].includes(String(value.status))) {
        return { kind: "command", id: value.id, commandId: value.commandId,
            ...(value.reenabled === true ? { reenabled: true } : {}),
            status: value.status === "agent-required" ? "agent-required" : value.status === "integration-required" ? "integration-required" : value.status === "completed" ? "completed" : "failed",
            ...(typeof value.value === "string" ? { value: value.value } : {}),
            ...(typeof value.error === "string" ? { error: value.error } : value.status === "running" ? { error: localeMessages.commands.interrupted } : {}),
            ...(isCreatorRunReceipt(value.receipt) ? { receipt: value.receipt } : {}) };
    }
    if (value.kind === "question")
        return parseCreatorQuestion(value);
    if (value.kind === "stage" &&
        isCreatorStageName(value.name) &&
        (value.status === "running" ||
            value.status === "completed" ||
            value.status === "failed")) {
        const metadata = parseCreatorStepMetadata({ creator: value.metadata });
        const interrupted = value.status === "running";
        const displayIntent = typeof value.displayIntent === "string" ? value.displayIntent : undefined;
        return {
            kind: "stage",
            id: value.id,
            name: value.name,
            status: interrupted ? "failed" : value.status,
            ...(displayIntent === undefined ? {} : { displayIntent }),
            ...(metadata === undefined ? {} : { metadata }),
            ...(typeof value.error === "string"
                ? { error: value.error }
                : interrupted
                    ? { error: localeMessages.creatorWorkbench.thisStageWasStillRunningWhenThePage }
                    : {}),
        };
    }
    if (value.kind === "tool" &&
        typeof value.name === "string" &&
        typeof value.arguments === "string" &&
        (value.status === "preparing" ||
            value.status === "running" ||
            value.status === "completed" ||
            value.status === "failed")) {
        const interrupted = value.status === "preparing" || value.status === "running";
        const waitingForAnswer = interrupted && value.name === "ask_user_question";
        return {
            kind: "tool",
            id: value.id,
            name: value.name,
            arguments: value.arguments,
            ...(typeof value.result === "string" ? { result: value.result } : {}),
            ...(typeof value.error === "string"
                ? { error: value.error }
                : interrupted && !waitingForAnswer
                    ? { error: localeMessages.creatorWorkbench.thisToolCallWasStillRunningWhenThe }
                    : {}),
            status: interrupted && !waitingForAnswer ? "failed" : value.status,
        };
    }
    const role = value.role;
    if ((value.kind === "message" || value.kind === undefined) &&
        (role === "user" || role === "assistant" || role === "error") &&
        typeof value.content === "string") {
        return {
            kind: "message",
            id: value.id,
            role,
            content: value.content,
            ...(isCreatorRunReceipt(value.receipt) ? { receipt: value.receipt } : {}),
            streaming: false,
        };
    }
    return undefined;
}
function parsedItems(value, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((item) => {
        const parsed = storedItem(item, localeMessages);
        return parsed === undefined ? [] : [parsed];
    });
}
function parsedAgentMessages(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((message) => {
        const parsed = MessageSchema.safeParse(message);
        return parsed.success ? [parsed.data] : [];
    });
}
function emptyConversation() {
    return { threadId: crypto.randomUUID(), items: [], agentMessages: [] };
}
function storedConversation(workspaceId, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    try {
        const value = JSON.parse(sessionStorage.getItem(conversationKey(workspaceId)) ?? "null");
        if (Array.isArray(value)) {
            const items = parsedItems(value, localeMessages);
            const textMessages = items.filter((item) => item.kind === "message");
            return {
                threadId: crypto.randomUUID(),
                items,
                agentMessages: creatorAgentMessages(textMessages),
            };
        }
        if (isRecord(value) && typeof value.threadId === "string") {
            return {
                threadId: value.threadId,
                items: parsedItems(value.items, localeMessages),
                agentMessages: parsedAgentMessages(value.agentMessages),
            };
        }
    }
    catch {
        // A corrupt development-only session should not prevent the preview loading.
    }
    return emptyConversation();
}
function saveConversation(agent, items, workspaceId) {
    sessionStorage.setItem(conversationKey(workspaceId), JSON.stringify({
        threadId: agent.threadId,
        items: items.slice(-60),
        agentMessages: agent.messages,
    }));
}
function CreatorMarkdown({ content }) {
    return (_jsx("div", { className: "creator-markdown", children: _jsx(ReactMarkdown, { remarkPlugins: markdownPlugins, children: content }) }));
}
function CreatorRunDiagnostics({ diagnosticLog }) {
    const localeMessages = useAgentUILocale();
    return (_jsxs("div", { className: "creator-receipt-section", children: [_jsx("h2", { children: localeMessages.creatorWorkbench.diagnosticLog }), _jsx("div", { className: "creator-receipt-meta", children: localeMessages.creatorWorkbench.creatorSavedTheModelToolAndValidationTrace }), _jsx("pre", { "aria-label": localeMessages.creatorWorkbench.creatorDiagnosticLogPath, children: _jsx("code", { children: diagnosticLog.path }) }), _jsx("div", { className: "creator-receipt-note", children: localeMessages.creatorWorkbench.logsMayContainUserRequestsProjectContentAnd })] }));
}
function CreatorValidationSections({ validations, showHeading = true }) {
    const localeMessages = useAgentUILocale();
    if (validations.length === 0)
        return null;
    return (_jsxs("div", { className: "creator-receipt-section", children: [showHeading ? _jsx("h2", { children: localeMessages.creatorWorkbench.validationResults }) : null, validations.map((validation, index) => (_jsxs("details", { className: "creator-receipt-item", children: [_jsxs("summary", { children: [_jsx("span", { className: `creator-receipt-status creator-receipt-status--${validation.status}`, children: getValidationStatusLabels(localeMessages)[validation.status] }), _jsx("code", { children: validation.command })] }), _jsxs("div", { className: "creator-receipt-meta", children: [localeMessages.creatorWorkbench.revision, validation.revision ?? localeMessages.creatorWorkbench.legacyReceipt, " ", localeMessages.creatorWorkbench.exitCode, validation.exitCode ?? localeMessages.creatorWorkbench.unavailable] }), _jsx("pre", { "aria-label": formatLocaleMessage(localeMessages.creatorWorkbench.output, validation.command), children: _jsx("code", { children: validation.output || localeMessages.creatorWorkbench.noCommandOutput }) }), validation.truncated ? (_jsx("div", { className: "creator-receipt-note", children: localeMessages.creatorWorkbench.validationOutputTruncated })) : null] }, `${validation.command}-${index}`)))] }));
}
function CreatorPluginDeliveryReports({ receipt }) {
    const localeMessages = useAgentUILocale();
    return _jsx(_Fragment, { children: receipt.pluginDeliveries?.map(report => (_jsxs("div", { className: "creator-receipt-section creator-delivery-report", children: [_jsxs("h2", { children: [localeMessages.creatorWorkbench.pluginDelivery, report.pluginId] }), _jsx("p", { children: report.delivery.status === "completed" ? localeMessages.creatorWorkbench.deliveryComplete : report.delivery.status === "statically-verified" ? localeMessages.creatorWorkbench.staticChecksPassedRuntimeAndBrowserUnverified : report.delivery.status === "blocked" ? localeMessages.creatorWorkbench.deliveryBlocked : localeMessages.creatorWorkbench.deliveryInProgress }), _jsx("div", { className: "creator-delivery-checks", children: Object.entries(report.verification).map(([name, status]) => (_jsxs("span", { title: `${name}: ${status}`, children: [{ static: localeMessages.creatorWorkbench.staticChecks, runtime: localeMessages.creatorWorkbench.runVerification, geometry: localeMessages.creatorWorkbench.layoutVerification }[name] ?? name, "\uFF1A", { pass: localeMessages.creatorWorkbench.passed, "not-passed": localeMessages.creatorWorkbench.failed2, "not-run": localeMessages.creatorWorkbench.unverified, failed: localeMessages.creatorWorkbench.failed }[status] ?? creatorDiagnosticValue(status, localeMessages)] }, name))) }), report.delivery.blockers.map(blocker => _jsx("p", { className: "creator-delivery-blocker", children: blocker }, blocker)), _jsxs("details", { children: [_jsx("summary", { children: localeMessages.creatorWorkbench.deliveryDetails }), _jsxs("p", { children: [localeMessages.creatorWorkbench.plan, report.decision.type, " ", localeMessages.creatorWorkbench.authorization, report.authorization.status, " ", localeMessages.creatorWorkbench.stage, report.delivery.lastSuccessfulStage] })] })] }, report.pluginId))) });
}
function CreatorMutationReceipt({ receipt, debug, onUndo, onReapply, undoBusy, reapplyBusy }) {
    const localeMessages = useAgentUILocale();
    const verification = receipt.verification;
    const verificationPassed = verification?.status === "changed-and-statically-verified" ||
        verification?.status === "changed-and-verified" ||
        verification?.status === "no-project-change" ||
        verification?.status === "decision-no-project-change";
    const verificationTone = verification?.status === "changed-unverified"
        ? "unavailable"
        : verificationPassed
            ? "passed"
            : "failed";
    const verificationLabel = verification === undefined
        ? ""
        : verification.status === "changed-unverified"
            ? verification.checks.some((check) => check.id === "operation-postcondition" &&
                check.status === "unavailable")
                ? localeMessages.creatorWorkbench.changesCommittedRequestOutcomeUnconfirmed
                : verification.runtimeStatus === "stale"
                    ? localeMessages.creatorWorkbench.changesCommittedRuntimeHasNotObservedTheUpdate
                    : verification.runtimeStatus === "unavailable"
                        ? localeMessages.creatorWorkbench.changesCommittedRuntimeTemporarilyUnavailable
                        : localeMessages.creatorWorkbench.changesCommittedRequestOutcomeUnconfirmed
            : getVerificationStatusLabels(localeMessages)[verification.status];
    return (_jsxs("section", { className: "creator-receipt", "aria-label": localeMessages.creatorWorkbench.changeReceipt, children: [_jsxs("header", { className: "creator-receipt-header", children: [_jsx("strong", { children: localeMessages.creatorWorkbench.changeReceipt }), _jsxs("span", { children: [receipt.files.length, " ", localeMessages.creatorWorkbench.files, receipt.validations.length > 0 ? formatLocaleMessage(localeMessages.creatorWorkbench.validations, receipt.validations.length) : ""] })] }), _jsx(CreatorPluginDeliveryReports, { receipt: receipt }), receipt.transaction === undefined ? null : (_jsxs("div", { className: "creator-receipt-section", children: [_jsx("h2", { children: localeMessages.creatorWorkbench.changeOperation }), _jsxs("div", { className: "creator-receipt-meta", children: [_jsx("span", { className: `creator-receipt-status creator-receipt-status--${receipt.transaction.undone ? "undone" : receipt.transaction.undoable ? "passed" : "failed"}`, children: receipt.transaction.undone ? localeMessages.creatorWorkbench.undone : receipt.transaction.undoable ? localeMessages.creatorWorkbench.canUndo : localeMessages.creatorWorkbench.cannotUndoNow }), debug ? _jsxs(_Fragment, { children: [" \u00B7 Run ", _jsx("code", { children: receipt.transaction.runId })] }) : null] }), _jsxs("div", { className: "creator-receipt-note", children: [receipt.transaction.undone
                                ? receipt.transaction.reapplyable
                                    ? localeMessages.creatorWorkbench.allFilesAreCheckedBeforeReapplyingLaterManual
                                    : localeMessages.creatorWorkbench.filesRestoredToTheirPreviousStateThisRecord
                                : localeMessages.creatorWorkbench.allFilesAreCheckedAgainWhenUndoingLater, receipt.transaction.reapplied ? localeMessages.creatorWorkbench.reappliedChangesHaveNotBeenReverified : null] }), receipt.transaction.undoable && onUndo !== undefined ? (_jsx(Button, { size: "sm", variant: "outline", className: "creator-receipt-action", type: "button", disabled: undoBusy, onClick: () => onUndo(receipt.transaction.runId), children: undoBusy ? localeMessages.creatorWorkbench.undoing : localeMessages.creatorWorkbench.undoTheseChanges })) : null, receipt.transaction.undone && receipt.transaction.reapplyable && onReapply !== undefined ? (_jsx(Button, { size: "sm", variant: "outline", className: "creator-receipt-action creator-receipt-action--reapply", type: "button", disabled: reapplyBusy, onClick: () => onReapply(receipt.transaction.runId), children: reapplyBusy ? localeMessages.creatorWorkbench.reapplying : localeMessages.creatorWorkbench.reapplyTheseChanges })) : null] })), verification === undefined ? null : (_jsxs("div", { className: "creator-receipt-section", children: [_jsx("h2", { children: receipt.transaction?.undone || receipt.transaction?.reapplied ? localeMessages.creatorWorkbench.originalRunVerification : localeMessages.creatorWorkbench.completionVerification }), _jsxs("div", { className: "creator-receipt-meta", children: [_jsx("span", { className: `creator-receipt-status creator-receipt-status--${verificationTone}`, children: verificationLabel }), " ", "\u00B7 Revision ", verification.projectRevision, " ", localeMessages.creatorWorkbench.rechecks, " ", verification.auditAttempts, " ", localeMessages.creatorWorkbench.times] }), verification.checks.map((check) => (_jsxs("details", { className: "creator-receipt-item", children: [_jsxs("summary", { children: [_jsx("span", { className: `creator-receipt-status creator-receipt-status--${check.status}`, children: verificationCheckStatusLabel(check, localeMessages) }), _jsx("code", { children: check.id })] }), _jsx("pre", { children: _jsx("code", { children: check.evidence }) })] }, check.id)))] })), debug && receipt.diagnosticLog !== undefined ? (_jsx(CreatorRunDiagnostics, { diagnosticLog: receipt.diagnosticLog })) : null, _jsxs("div", { className: "creator-receipt-section", children: [_jsx("h2", { children: localeMessages.creatorWorkbench.fileChanges }), receipt.files.map((file) => (_jsxs("details", { className: "creator-receipt-item", children: [_jsxs("summary", { children: [_jsx("span", { className: `creator-receipt-status creator-receipt-status--${file.status}`, children: getFileStatusLabels(localeMessages)[file.status] }), _jsx("code", { children: file.path })] }), _jsx("pre", { "aria-label": `${file.path} Diff`, children: _jsx("code", { children: file.diff }) }), file.truncated ? (_jsx("div", { className: "creator-receipt-note", children: localeMessages.creatorWorkbench.diffTruncated })) : null] }, file.path)))] }), _jsx(CreatorValidationSections, { validations: receipt.validations })] }));
}
function CreatorRunReceiptPresentation({ receipt, debug, onUndo, onReapply, undoBusy, reapplyBusy }) {
    const localeMessages = useAgentUILocale();
    const presentation = classifyCreatorReceiptPresentation(receipt);
    if (presentation === "mutation") {
        return _jsx(CreatorMutationReceipt, { receipt: receipt, debug: debug, onUndo: onUndo, onReapply: onReapply, undoBusy: undoBusy, reapplyBusy: reapplyBusy });
    }
    if (presentation === "outcome") {
        return _jsxs("section", { className: "creator-receipt", "aria-label": localeMessages.creatorWorkbench.outcome, children: [_jsxs("header", { className: "creator-receipt-header", children: [_jsx("strong", { children: localeMessages.creatorWorkbench.outcome }), _jsxs("span", { children: [receipt.files.length, " ", localeMessages.creatorWorkbench.files] })] }), receipt.verification ? _jsx("div", { className: "creator-receipt-section", children: _jsx("p", { children: getVerificationStatusLabels(localeMessages)[receipt.verification.status] }) }) : null, _jsx(CreatorPluginDeliveryReports, { receipt: receipt }), _jsx(CreatorValidationSections, { validations: receipt.validations }), debug && receipt.diagnosticLog ? _jsx(CreatorRunDiagnostics, { diagnosticLog: receipt.diagnosticLog }) : null] });
    }
    if (presentation === "validation") {
        return (_jsxs("section", { className: "creator-receipt", "aria-label": localeMessages.creatorWorkbench.validationResults, children: [_jsxs("header", { className: "creator-receipt-header", children: [_jsx("strong", { children: localeMessages.creatorWorkbench.validationResults }), _jsxs("span", { children: [receipt.validations.length, " ", localeMessages.creatorWorkbench.validations2] })] }), _jsx(CreatorValidationSections, { validations: receipt.validations, showHeading: false }), debug && receipt.diagnosticLog !== undefined ? (_jsx(CreatorRunDiagnostics, { diagnosticLog: receipt.diagnosticLog })) : null] }));
    }
    if (debug && receipt.diagnosticLog !== undefined) {
        return (_jsxs("section", { className: "creator-receipt", "aria-label": localeMessages.creatorWorkbench.runDiagnostics, children: [_jsx("header", { className: "creator-receipt-header", children: _jsx("strong", { children: localeMessages.creatorWorkbench.runDiagnostics }) }), _jsx(CreatorRunDiagnostics, { diagnosticLog: receipt.diagnosticLog })] }));
    }
    return null;
}
function CreatorToolGroupCard({ activities }) {
    const localeMessages = useAgentUILocale();
    const pending = activities.filter(activity => activity.status === "preparing" || activity.status === "running");
    const failed = activities.filter(activity => activity.status === "failed").length;
    return _jsxs("details", { className: "creator-tool-group", "aria-label": localeMessages.creatorWorkbench.toolExecutionDetails, children: [_jsxs("summary", { children: [_jsx(ChevronDown, { "aria-hidden": "true", className: "creator-tool-group-chevron" }), _jsxs("strong", { children: [localeMessages.creatorWorkbench.toolCall, " ", activities.length, " ", localeMessages.creatorWorkbench.times] }), _jsxs("span", { className: `creator-tool-group-status${failed ? " creator-tool-group-status--failed" : ""}`, children: [pending.length ? _jsxs(_Fragment, { children: [_jsx(RefreshCw, { "aria-hidden": "true", className: "creator-tool-group-spinner" }), localeMessages.creatorWorkbench.running] }) : failed ? formatLocaleMessage(localeMessages.creatorWorkbench.failures, failed) : localeMessages.creatorWorkbench.completed, pending.length && failed ? formatLocaleMessage(localeMessages.creatorWorkbench.failures2, failed) : null] })] }), _jsx("div", { className: "creator-tool-group-body", children: activities.map(activity => _jsx(CreatorToolActivityCard, { activity: activity }, activity.id)) })] });
}
function CreatorToolActivityCard({ activity, }) {
    const localeMessages = useAgentUILocale();
    return (_jsxs("article", { "aria-label": formatLocaleMessage(localeMessages.creatorWorkbench.toolCall2, activity.name), className: `creator-tool-activity creator-tool-activity--${activity.status}`, children: [_jsxs("header", { children: [_jsx("span", { className: "creator-tool-activity-dot", "aria-hidden": "true" }), _jsx("strong", { children: activity.name }), _jsx(Badge, { variant: "secondary", className: "creator-tool-status", children: getToolStatusLabels(localeMessages)[activity.status] })] }), activity.arguments === "" ? null : (_jsxs("details", { open: activity.status === "preparing", children: [_jsx("summary", { children: localeMessages.creatorWorkbench.callArguments }), _jsx("pre", { children: _jsx("code", { children: activity.arguments }) })] })), activity.result === undefined ? null : (_jsxs("details", { open: activity.status === "failed", children: [_jsx("summary", { children: localeMessages.creatorWorkbench.toolResult }), _jsx("pre", { children: _jsx("code", { children: activity.result }) })] })), activity.error === undefined ? null : (_jsx("p", { className: "creator-tool-activity-error", children: activity.error }))] }));
}
function stageSymbol(status) {
    if (status === "running")
        return "○";
    if (status === "failed")
        return "✗";
    return "✓";
}
function debugValue(value, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    if (Array.isArray(value))
        return value.length === 0 ? "—" : value.join(", ");
    if (value === true)
        return localeMessages.creatorWorkbench.yes;
    if (value === false)
        return localeMessages.creatorWorkbench.no;
    if (value === null || value === undefined)
        return "—";
    return String(value);
}
// Translate presentation values while preserving raw diagnostic values in titles.
function creatorDiagnosticValue(value, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    const labels = {
        static_only: localeMessages.creatorWorkbench.staticValidationOnly,
        static_and_runtime: localeMessages.creatorWorkbench.staticAndRuntimeValidation,
        "not-run": localeMessages.creatorWorkbench.notExecuted,
        passed: localeMessages.creatorWorkbench.passed,
        failed: localeMessages.creatorWorkbench.failed2,
        stale: localeMessages.creatorWorkbench.notUpdatedYet,
        unavailable: localeMessages.creatorWorkbench.unavailable,
        running: localeMessages.creatorWorkbench.inProgress,
        completed: localeMessages.creatorWorkbench.completed,
        success: localeMessages.creatorWorkbench.succeeded,
        committed_unverified: localeMessages.creatorWorkbench.committedUnverified,
        already_satisfied: localeMessages.creatorWorkbench.alreadySatisfied,
        recovered: localeMessages.creatorWorkbench.recovered,
        already_recovered: localeMessages.creatorWorkbench.previouslyRecovered,
        needs_user_input: localeMessages.creatorWorkbench.moreInformationNeeded,
        productized: localeMessages.creatorWorkbench.predefinedOperation,
        "general-agent": localeMessages.creatorWorkbench.generalAgent,
        clarification: localeMessages.creatorWorkbench.clarificationNeeded,
        unsupported: localeMessages.creatorWorkbench.unsupported,
    };
    return typeof value === "string" ? labels[value] ?? value : debugValue(value, localeMessages);
}
function CreatorStageDebugDetails({ activity, }) {
    const localeMessages = useAgentUILocale();
    const metadata = activity.metadata ?? {};
    const isUnderstanding = activity.name === "creator.resolve";
    const isGrounding = activity.name === "creator.grounding";
    const isExecution = activity.name === "creator.productized-operation";
    const rows = (values) => (_jsx("dl", { className: "creator-stage-details-list", children: values.map(([label, value]) => (_jsxs("div", { children: [_jsx("dt", { children: label }), _jsx("dd", { title: debugValue(value, localeMessages), children: creatorDiagnosticValue(value, localeMessages) })] }, label))) }));
    return (_jsxs("div", { className: "creator-stage-debug", children: [isGrounding ? (_jsxs("section", { children: [_jsx("h3", { children: localeMessages.creatorWorkbench.contextPreparation }), rows([
                        [localeMessages.creatorWorkbench.snapshotGenerationTime, metadata.snapshotBuildMs === undefined ? "—" : `${metadata.snapshotBuildMs} ms`],
                        [localeMessages.creatorWorkbench.modelCalls, metadata.modelCalls ?? 0],
                        [localeMessages.creatorWorkbench.errorCode, metadata.errorCode],
                    ])] })) : null, isUnderstanding ? (_jsxs(_Fragment, { children: [_jsxs("section", { children: [_jsx("h3", { children: localeMessages.creatorWorkbench.requestUnderstanding }), rows([
                                [localeMessages.creatorWorkbench.errorCode, metadata.errorCode],
                                [localeMessages.creatorWorkbench.selectionFailureCode, metadata.selectorFailureReasonCode],
                                [localeMessages.creatorWorkbench.reason, metadata.selectorFailureReason],
                                [localeMessages.creatorWorkbench.decision, metadata.decision ?? metadata.intent],
                                [localeMessages.creatorWorkbench.operationID, metadata.actionId],
                                [localeMessages.creatorWorkbench.operationType, metadata.actionKind],
                                [localeMessages.creatorWorkbench.operationStatus, metadata.actionStatus],
                                [localeMessages.creatorWorkbench.operationSelections, metadata.actionSelectorCalls],
                                [localeMessages.creatorWorkbench.selectionRepairs, metadata.actionSelectorRepairCalls],
                                [localeMessages.creatorWorkbench.invalidSelectionResponses, metadata.actionSelectorInvalidResponses],
                                ...(metadata.actionSelectorRepairCalls !== undefined && metadata.actionSelectorRepairCalls > 0
                                    ? [
                                        [localeMessages.creatorWorkbench.repairReasonCode, metadata.actionSelectorRepairReasonCode],
                                        [localeMessages.creatorWorkbench.repairReason, metadata.actionSelectorRepairReason],
                                    ]
                                    : []),
                                [localeMessages.creatorWorkbench.modelCalls, metadata.modelCalls],
                                [localeMessages.creatorWorkbench.repairCalls, metadata.repairCalls],
                                [localeMessages.creatorWorkbench.duration, metadata.durationMs === undefined ? "—" : `${metadata.durationMs} ms`],
                                [localeMessages.creatorWorkbench.candidateCount, metadata.candidateCount],
                                [localeMessages.creatorWorkbench.contextCharacters, metadata.contextCharacters],
                            ])] }), _jsxs("section", { children: [_jsx("h3", { children: localeMessages.creatorWorkbench.changeTarget }), rows([
                                [localeMessages.creatorWorkbench.plugin, metadata.targetPluginIds],
                                [localeMessages.creatorWorkbench.instance, metadata.targetInstanceIds],
                            ])] }), metadata.placementType === undefined ? null : (_jsxs("section", { children: [_jsx("h3", { children: localeMessages.creatorWorkbench.placementVerification }), rows([
                                [localeMessages.creatorWorkbench.type, metadata.placementType],
                                [localeMessages.creatorWorkbench.anchorPlugin, metadata.anchorPluginId],
                                [localeMessages.creatorWorkbench.anchorInstance, metadata.anchorInstanceId],
                                [localeMessages.creatorWorkbench.relativeRelationship, metadata.relation],
                                [localeMessages.creatorWorkbench.parentPlugin, metadata.parentPluginId],
                                [localeMessages.creatorWorkbench.parentInstance, metadata.parentInstanceId],
                                [localeMessages.creatorWorkbench.slot, metadata.slot],
                            ])] })), metadata.effectType === undefined ? null : (_jsxs("section", { children: [_jsx("h3", { children: localeMessages.creatorWorkbench.scope }), rows([
                                [localeMessages.creatorWorkbench.type, metadata.effectType],
                                [localeMessages.creatorWorkbench.region, metadata.region],
                                [localeMessages.creatorWorkbench.parentPlugin, metadata.parentPluginId],
                                [localeMessages.creatorWorkbench.parentInstance, metadata.parentInstanceId],
                                [localeMessages.creatorWorkbench.slot, metadata.slot],
                            ])] })), _jsxs("section", { children: [_jsx("h3", { children: localeMessages.creatorWorkbench.executionRoute }), rows([
                                [localeMessages.creatorWorkbench.predefinedOperation, metadata.route === "productized"],
                                [localeMessages.creatorWorkbench.generalAgent, metadata.route === "general-agent"],
                                [localeMessages.creatorWorkbench.clarificationNeeded, metadata.route === "clarification"],
                                [localeMessages.creatorWorkbench.unsupported, metadata.route === "unsupported"],
                            ])] }), metadata.route === "general-agent" ? (_jsxs("section", { children: [_jsx("h3", { children: localeMessages.creatorWorkbench.generalAgent }), rows([
                                [localeMessages.creatorWorkbench.modelCalls, metadata.generalAgentModelCalls],
                                [localeMessages.creatorWorkbench.toolCalls, metadata.generalAgentToolCalls],
                                [localeMessages.creatorWorkbench.totalModelCalls, metadata.totalModelCalls],
                            ])] })) : null] })) : null, isExecution ? (_jsxs(_Fragment, { children: [_jsxs("section", { children: [_jsx("h3", { children: localeMessages.creatorWorkbench.changeExecution }), rows([
                                [localeMessages.creatorWorkbench.executionModelCalls, metadata.executionModelCalls],
                                [localeMessages.creatorWorkbench.toolCalls, metadata.toolCalls],
                                [localeMessages.creatorWorkbench.deepAgentCalls, metadata.deepAgentCalls],
                                [localeMessages.creatorWorkbench.changeAttempts, metadata.mutationAttempts],
                            ])] }), _jsxs("section", { children: [_jsx("h3", { children: localeMessages.creatorWorkbench.validationResults }), rows([
                                [localeMessages.creatorWorkbench.verificationMethod, metadata.verificationMode],
                                [localeMessages.creatorWorkbench.staticValidation, metadata.staticStatus],
                                [localeMessages.creatorWorkbench.runtimeValidation, metadata.runtimeStatus],
                                [localeMessages.creatorWorkbench.freshnessChecks, metadata.runtimeFreshnessAttempts],
                                [localeMessages.creatorWorkbench.runtimeWait, metadata.runtimeFreshnessWaitMs === undefined ? "—" : `${metadata.runtimeFreshnessWaitMs} ms`],
                                [localeMessages.creatorWorkbench.placementVerification, metadata.placementVerified],
                                [localeMessages.creatorWorkbench.geometryVerification, metadata.geometryVerified],
                            ])] })] })) : null] }));
}
function CreatorStageActivityCard({ activity, debug, }) {
    const localeMessages = useAgentUILocale();
    if (!shouldPresentStage(activity, debug)) {
        return null;
    }
    return (_jsxs("article", { "aria-label": debug ? formatLocaleMessage(localeMessages.creatorWorkbench.creatorStage, activity.name) : creatorStageTitle(activity, localeMessages), className: `creator-stage-activity creator-stage-activity--${activity.status}`, children: [_jsxs("div", { className: "creator-stage-summary", children: [_jsx("span", { className: "creator-stage-symbol", "aria-hidden": "true", children: stageSymbol(activity.status) }), _jsxs("div", { children: [_jsx("strong", { children: creatorStageTitle(activity, localeMessages) }), activity.name === "creator.resolve" &&
                                activity.displayIntent !== undefined &&
                                activity.metadata?.route !== "clarification" &&
                                activity.status === "completed" ? (_jsx("span", { className: "creator-stage-intent", children: activity.displayIntent })) : null, activity.error === undefined ? null : (_jsx("span", { className: "creator-stage-error", children: activity.error }))] })] }), debug ? (_jsxs("details", { className: "creator-stage-diagnostics", children: [_jsx("summary", { children: localeMessages.creatorWorkbench.diagnosticDetails }), _jsx(CreatorStageDebugDetails, { activity: activity })] })) : null] }));
}
function setupError(error) {
    if (error instanceof CreatorWorkspaceRequestError) {
        return { message: error.message, ...(error.code === undefined ? {} : { code: error.code }),
            ...(error.details === undefined ? {} : { details: error.details }) };
    }
    return { message: error instanceof Error ? error.message : String(error) };
}
function CreatorWorkbenchContent({ children, previewWorkspaceId, layout = "workbench" }) {
    const localeMessages = useAgentUILocale();
    const localeMessagesRef = useLocaleMessagesRef(localeMessages);
    localeMessagesRef.current = localeMessages;
    const creatorDebug = resolveCreatorDebugMode({
        hostname: window.location.hostname,
        search: window.location.search,
    });
    const [initialConversation] = useState(emptyConversation);
    const [items, setItems] = useState(initialConversation.items);
    const [input, setInput] = useState("");
    const [isOpen, setIsOpen] = useState(true);
    const [agentPanelOpen, setAgentPanelOpen] = useState(false);
    const [mockPanelOpen, setMockPanelOpen] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [panelWidth, setPanelWidth] = useState(null);
    const [isRunning, setIsRunning] = useState(false);
    const [recoveringRunId, setRecoveringRunId] = useState(null);
    const [threadId, setThreadId] = useState(initialConversation.threadId);
    const [workspaceState, setWorkspaceState] = useState(null);
    const [workspacePath, setWorkspacePath] = useState("");
    const [workspaceError, setWorkspaceError] = useState(null);
    const [workspaceBusy, setWorkspaceBusy] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshMessage, setRefreshMessage] = useState("");
    const refreshInFlight = useRef(false);
    const [stopBusy, setStopBusy] = useState(false);
    const [undoRunId, setUndoRunId] = useState(null);
    const [updateCheckRequest, setUpdateCheckRequest] = useState(0);
    const [updatePageOpen, setUpdatePageOpen] = useState(false);
    const handleUpdatePageChange = useCallback((open) => {
        setUpdatePageOpen(open);
        if (open) {
            setMockPanelOpen(false);
            setAgentPanelOpen(false);
        }
    }, []);
    const [updateNotificationTarget, setUpdateNotificationTarget] = useState(null);
    const [reapplyRunId, setReapplyRunId] = useState(null);
    const [runAccepted, setRunAccepted] = useState(false);
    const [workspacePicking, setWorkspacePicking] = useState(false);
    const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(true);
    const [setupInfo, setSetupInfo] = useState({ status: "idle" });
    const [setupDraft, setSetupDraft] = useState(createEmptyCreatorSetupDraft);
    const [setupValidationEpoch, setSetupValidationEpoch] = useState(0);
    const [setupNeedsRefresh, setSetupNeedsRefresh] = useState(false);
    const messageList = useRef(null);
    const panel = useRef(null);
    const workspaceControl = useRef(null);
    const resizeStart = useRef(null);
    const itemsRef = useRef(items);
    const agentRef = useRef(null);
    const runInFlightRef = useRef(false);
    const workspaceIdRef = useRef(undefined);
    const commandState = useCreatorCommandState(input, workspaceState?.status === "ready" ? workspaceState.workspace.id : undefined);
    const [commandBusy, setCommandBusy] = useState(false);
    const [commandPreviewRevision, setCommandPreviewRevision] = useState(0);
    const commandInFlight = useRef(false);
    const sessionRef = useRef(0);
    const setupValidationRef = useRef({ generation: 0, controller: undefined });
    const setupInfoRef = useRef({ generation: 0, controller: undefined });
    const initializingRef = useRef(false);
    const invalidateSetupValidation = () => {
        setupValidationRef.current.generation += 1;
        setupValidationRef.current.controller?.abort();
        setupValidationRef.current.controller = undefined;
    };
    const invalidateSetupInfo = () => {
        setupInfoRef.current.generation += 1;
        setupInfoRef.current.controller?.abort();
        setupInfoRef.current.controller = undefined;
    };
    const updateItems = (updater) => {
        const next = updater(itemsRef.current);
        itemsRef.current = next;
        setItems(next);
    };
    const installWorkspace = (next) => {
        sessionRef.current += 1;
        agentRef.current?.abort();
        const oldId = workspaceIdRef.current;
        if (oldId !== undefined && agentRef.current !== null) {
            saveConversation(agentRef.current, itemsRef.current, oldId);
        }
        const id = next.status === "none" ? undefined : next.workspace.id;
        if (oldId !== undefined && oldId !== id)
            sessionStorage.removeItem(activeRunKey(oldId));
        if (oldId !== id || next.status !== "uninitialized") {
            invalidateSetupValidation();
            invalidateSetupInfo();
            setSetupInfo({ status: "idle" });
            setSetupDraft(createEmptyCreatorSetupDraft());
            setSetupNeedsRefresh(false);
        }
        workspaceIdRef.current = id;
        const conversation = id === undefined || next.status === "uninitialized" || next.status === "broken"
            ? emptyConversation() : storedConversation(id, localeMessages);
        const pending = id !== undefined && next.status === "ready" && next.runtime.status === "ready"
            ? storedRun(id, conversation.threadId, localeMessages) : undefined;
        agentRef.current = (next.status === "ready") && next.runtime.status === "ready"
            ? new CreatorAgentClient(id, conversation.threadId, pending?.agentMessages ?? conversation.agentMessages)
            : null;
        itemsRef.current = pending?.items ?? conversation.items;
        setItems(itemsRef.current);
        setThreadId(conversation.threadId);
        setInput("");
        setIsRunning(false);
        runInFlightRef.current = false;
        setRunAccepted(false);
        setStopBusy(false);
        setRecoveringRunId(pending?.runId ?? null);
        setWorkspaceState(next);
        rememberWorkspacePath(next.status === "none" ? null : next.workspace.displayPath);
    };
    useEffect(() => {
        let active = true;
        const loadWorkspace = async () => {
            setWorkspaceBusy(true);
            try {
                let state = await getWorkspaceState(localeMessagesRef.current);
                if (state.status === "none") {
                    const previousPath = rememberedWorkspacePath();
                    if (previousPath !== null) {
                        try {
                            state = await selectWorkspaceProject(previousPath, localeMessagesRef.current);
                        }
                        catch (error) {
                            rememberWorkspacePath(null);
                            if (active)
                                setWorkspaceError(error instanceof Error ? error.message : String(error));
                        }
                    }
                }
                if (active) {
                    installWorkspace(state);
                    setShowWorkspaceSelector(state.status === "none");
                }
            }
            catch (error) {
                if (active)
                    setWorkspaceError(error instanceof Error ? error.message : String(error));
            }
            finally {
                if (active)
                    setWorkspaceBusy(false);
            }
        };
        void loadWorkspace();
        return () => { active = false; };
    }, []);
    useEffect(() => {
        if (!showWorkspaceSelector)
            return;
        const closeOnOutsideClick = (event) => {
            if (!workspaceControl.current?.contains(event.target))
                setShowWorkspaceSelector(false);
        };
        const closeOnEscape = (event) => {
            if (event.key === "Escape") {
                setShowWorkspaceSelector(false);
                workspaceControl.current?.querySelector(".creator-workspace-trigger")?.focus();
            }
        };
        document.addEventListener("pointerdown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [showWorkspaceSelector, workspaceState?.status]);
    const setupWorkspaceId = workspaceState?.status === "uninitialized" ? workspaceState.workspace.id : undefined;
    const loadSetupInfo = (workspaceId) => {
        invalidateSetupInfo();
        const generation = setupInfoRef.current.generation;
        const controller = new AbortController();
        setupInfoRef.current.controller = controller;
        setSetupInfo({ status: "loading" });
        void getWorkspaceSetup(controller.signal, localeMessages).then((info) => {
            if (!isSetupRequestCurrent({ requestGeneration: generation, currentGeneration: setupInfoRef.current.generation,
                requestWorkspaceId: workspaceId, currentWorkspaceId: workspaceIdRef.current, aborted: controller.signal.aborted }))
                return;
            setSetupInfo({ status: "ready", info });
            setSetupDraft({ ...createEmptyCreatorSetupDraft(), sourceRoot: info.suggestedSourceRoot });
        }).catch((error) => {
            if (!isSetupRequestCurrent({ requestGeneration: generation, currentGeneration: setupInfoRef.current.generation,
                requestWorkspaceId: workspaceId, currentWorkspaceId: workspaceIdRef.current, aborted: controller.signal.aborted }))
                return;
            setSetupInfo({ status: "failed", error: error instanceof Error ? error.message : String(error) });
        });
    };
    useEffect(() => {
        if (setupWorkspaceId === undefined)
            return;
        loadSetupInfo(setupWorkspaceId);
        return () => {
            invalidateSetupInfo();
            invalidateSetupValidation();
        };
    }, [setupWorkspaceId]);
    useEffect(() => {
        if (setupWorkspaceId === undefined || workspaceBusy || setupInfo.status !== "ready" ||
            setupDraft.mode === null || setupDraft.sourceRoot.trim() === "")
            return;
        const workspaceId = setupWorkspaceId;
        const mode = setupDraft.mode;
        const sourceRoot = setupDraft.sourceRoot;
        const timer = window.setTimeout(() => {
            invalidateSetupValidation();
            const generation = setupValidationRef.current.generation;
            const controller = new AbortController();
            setupValidationRef.current.controller = controller;
            setSetupDraft((current) => ({ ...current, validation: { status: "validating" } }));
            void validateWorkspaceSetup({ mode, sourceRoot }, controller.signal, localeMessagesRef.current).then((result) => {
                if (!isSetupRequestCurrent({ requestGeneration: generation, currentGeneration: setupValidationRef.current.generation,
                    requestWorkspaceId: workspaceId, currentWorkspaceId: workspaceIdRef.current, aborted: controller.signal.aborted }))
                    return;
                setSetupDraft((current) => ({ ...current, validation: {
                        status: isCreatorSetupValidationUsable(result) ? "valid" : "invalid",
                        result,
                    } }));
            }).catch((error) => {
                if (!isSetupRequestCurrent({ requestGeneration: generation, currentGeneration: setupValidationRef.current.generation,
                    requestWorkspaceId: workspaceId, currentWorkspaceId: workspaceIdRef.current, aborted: controller.signal.aborted }))
                    return;
                setSetupDraft((current) => ({ ...current, validation: { status: "idle" }, error: setupError(error) }));
            });
        }, 275);
        return () => window.clearTimeout(timer);
    }, [setupWorkspaceId, workspaceBusy, setupInfo.status, setupDraft.mode, setupDraft.sourceRoot, setupValidationEpoch]);
    useEffect(() => {
        const agent = agentRef.current;
        if (agent !== null && workspaceIdRef.current !== undefined) {
            saveConversation(agent, items, workspaceIdRef.current);
        }
        messageList.current?.scrollTo({
            top: workspaceState?.status === "ready" && items.length === 0
                ? 0 : messageList.current.scrollHeight,
            behavior: "smooth",
        });
    }, [items, workspaceState]);
    useEffect(() => () => {
        sessionRef.current += 1;
        agentRef.current?.abort();
    }, []);
    useEffect(() => {
        const handlePointerMove = (event) => {
            const start = resizeStart.current;
            if (start === null || start.pointerId !== event.pointerId) {
                return;
            }
            setPanelWidth(clampCreatorPanelWidth(start.width + start.x - event.clientX));
        };
        const finishResize = () => {
            resizeStart.current = null;
            setIsResizing(false);
        };
        const handlePointerEnd = (event) => {
            if (resizeStart.current?.pointerId !== event.pointerId) {
                return;
            }
            finishResize();
        };
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerEnd);
        window.addEventListener("pointercancel", handlePointerEnd);
        window.addEventListener("blur", finishResize);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerEnd);
            window.removeEventListener("pointercancel", handlePointerEnd);
            window.removeEventListener("blur", finishResize);
        };
    }, []);
    const executeSlashCommand = async (request) => {
        const parsed = parseCreatorCommand(request);
        if (parsed.kind !== "command")
            return;
        if (commandInFlight.current || isRunning || runInFlightRef.current || workspaceBusy || undoRunId || reapplyRunId || hasPendingCreatorQuestion(itemsRef.current) || workspaceState?.status !== "ready")
            return;
        if (parsed.id === "" || (["enable", "disable"].includes(parsed.id) && parsed.args.length === 0)) {
            setInput(parsed.id === "" ? "/" : `/${parsed.id} `);
            commandState.show();
            return;
        }
        const activity = { kind: "command", id: crypto.randomUUID(), commandId: parsed.id, status: "running", ...(parsed.args[0] ? { value: parsed.args[0] } : {}) };
        const fail = (error) => updateItems(current => current.map(item => item.kind === "command" && item.id === activity.id ? { ...item, status: "failed", error } : item));
        if (!["sync", "enable", "disable"].includes(parsed.id)) {
            updateItems(current => [...current, activity]);
            fail(formatLocaleMessage(localeMessages.commands.unknownCommand, parsed.id));
            return;
        }
        let selectedOption;
        if (["enable", "disable"].includes(parsed.id)) {
            const option = commandState.catalog.commands.find(command => command.id === parsed.id)?.options.find(option => option.id === parsed.args.join(" "));
            if (!option) {
                commandState.show();
                return;
            }
            if (option.disabled)
                return;
            selectedOption = option;
        }
        updateItems(current => [...current, activity]);
        if (parsed.args.length !== (parsed.id === "sync" ? 0 : 1)) {
            fail(localeMessages.commands.chooseOption);
            return;
        }
        commandInFlight.current = true;
        setCommandBusy(true);
        const session = sessionRef.current;
        const id = workspaceState.workspace.id;
        let preparationStarted = false;
        try {
            const commandRequest = parsed.id === "enable" && selectedOption?.action === "add" ? { id: "enable", args: { pluginId: selectedOption.pluginId } } : parsed.id === "enable" || parsed.id === "disable" ? { id: parsed.id, args: { instanceId: parsed.args[0] } } : { id: "sync", args: {} };
            let result = await executeCreatorCommand(id, commandRequest, localeMessages);
            if (session !== sessionRef.current)
                return;
            const continued = await confirmPluginEnablement(commandRequest, result, localeMessages.commands, pluginId => commandState.optionLabel("enable", pluginId), message => window.confirm(message), request => {
                if (session !== sessionRef.current)
                    throw new Error("CREATOR_WORKSPACE_CHANGED");
                preparationStarted = true;
                return executeCreatorCommand(id, request, localeMessages);
            });
            if (!continued) {
                updateItems(current => current.map(item => item.id === activity.id ? { ...activity, status: "cancelled" } : item));
                setInput("");
                return;
            }
            result = continued;
            if (session !== sessionRef.current)
                return;
            if (result.status === "confirmation-required")
                throw new Error("PLUGIN_ENABLEMENT_PREPARATION_STALE");
            const commandStatus = result.status ?? "completed";
            updateItems(current => current.map(item => item.id === activity.id ? { ...activity, ...(result.value ? { value: result.value } : {}), ...(result.reenabled ? { reenabled: true } : {}), status: commandStatus, receipt: result.receipt } : item));
            setInput("");
            if (result.addPluginId) {
                if (!agentRef.current || workspaceState.runtime.status !== "ready")
                    throw new Error("CREATOR_RUNTIME_UNAVAILABLE");
                commandInFlight.current = false;
                setCommandBusy(false);
                await submit(undefined, undefined, formatLocaleMessage(localeMessages.commands.addPluginRequest, JSON.stringify(result.addPluginId)));
            }
            if (result.integrationPlan) {
                commandInFlight.current = false;
                setCommandBusy(false);
                await submit(undefined, undefined, localeMessages.commands.integrateAgentUI);
            }
            if (result.changed) {
                const refreshed = await refreshWorkspaceProject(localeMessages).catch(() => undefined);
                if (session === sessionRef.current) {
                    if (refreshed)
                        setWorkspaceState(refreshed);
                    setCommandPreviewRevision(value => value + 1);
                }
            }
        }
        catch (error) {
            if (session === sessionRef.current) {
                const code = error instanceof Error && "code" in error ? error.code : undefined;
                fail(code === "CREATOR_COMMAND_BUSY" ? localeMessages.commands.busy : code === "PLUGIN_ENABLEMENT_PREPARATION_STALE" ? localeMessages.commands.preparationStale : preparationStarted ? localeMessages.commands.preparationFailed : parsed.id === "sync" ? localeMessages.commands.syncFailed : parsed.id === "enable" || parsed.id === "disable" ? localeMessages.commands.toggleFailed : localeMessages.commands.failed);
            }
        }
        finally {
            commandInFlight.current = false;
            setCommandBusy(false);
            if (session === sessionRef.current)
                void commandState.refresh();
        }
    };
    const submit = async (event, response, requestOverride, reconnectRunId) => {
        event?.preventDefault();
        const request = (requestOverride ?? input).trim();
        if (reconnectRunId === undefined && response === undefined && parseCreatorCommand(request).kind === "command") {
            await executeSlashCommand(request);
            return;
        }
        if (commandInFlight.current)
            return;
        if ((reconnectRunId === undefined && response === undefined && (request === "" || hasPendingCreatorQuestion(itemsRef.current))) ||
            isRunning || runInFlightRef.current || !((workspaceState?.status === "ready") && workspaceState.runtime.status === "ready")) {
            return;
        }
        if (response !== undefined && !itemsRef.current.some(item => item.kind === "question" && item.id === response.question.id && item.status === "pending"))
            return;
        const agent = agentRef.current;
        if (agent === null) {
            return;
        }
        const runSession = sessionRef.current;
        const runWorkspaceId = workspaceIdRef.current;
        if (runWorkspaceId === undefined)
            return;
        if (reconnectRunId === undefined && storedRun(runWorkspaceId, agent.threadId, localeMessages)) {
            updateItems(current => [...current, { kind: "message", id: crypto.randomUUID(), role: "error", content: localeMessages.creatorWorkbench.runConnectionLost }]);
            return;
        }
        const runId = reconnectRunId ?? crypto.randomUUID();
        let completed = false;
        runInFlightRef.current = true;
        const updateRunItems = (updater) => {
            if (sessionRef.current === runSession)
                updateItems(updater);
        };
        if (response === undefined && reconnectRunId === undefined)
            setInput("");
        setIsRunning(true);
        setRunAccepted(false);
        if (response === undefined && reconnectRunId === undefined) {
            const userMessageId = crypto.randomUUID();
            updateItems((current) => [...current, { kind: "message", id: userMessageId, role: "user", content: request }]);
            agent.addMessage({ id: userMessageId, role: "user", content: request });
        }
        else if (response !== undefined) {
            updateItems(current => current.map(item => item.kind === "question" && item.id === response.question.id
                ? { ...item, status: "submitting", answers: response.answers } : item));
        }
        let latestAssistantMessageId;
        let runErrorHandled = false;
        let runErrorCode;
        const projectStep = (kind, event) => {
            if (!creatorStageNames.includes(event.stepName)) {
                return;
            }
            updateRunItems((current) => {
                const stageIndex = [...current]
                    .map((item, index) => ({ item, index }))
                    .reverse()
                    .find(({ item }) => kind === "finished" &&
                    item.kind === "stage" &&
                    item.name === event.stepName &&
                    item.status === "running")?.index;
                const existing = stageIndex === undefined ? undefined : current[stageIndex];
                const projected = projectCreatorIntentStage(existing?.kind === "stage" ? existing : undefined, {
                    kind,
                    name: event.stepName,
                    ...(kind === "started" && stageIndex === undefined
                        ? { id: crypto.randomUUID() }
                        : {}),
                    metadata: event.metadata,
                });
                if (projected === undefined)
                    return current;
                if (stageIndex === undefined)
                    return [...current, projected];
                return current.map((item, index) => index === stageIndex ? projected : item);
            });
        };
        try {
            if (reconnectRunId === undefined) {
                // Capture the pre-stream baseline before POST. Replaying into it avoids
                // duplicated deltas, tools and receipts after a full Host reload.
                saveConversation(agent, itemsRef.current, runWorkspaceId);
                sessionStorage.setItem(activeRunKey(runWorkspaceId), JSON.stringify({ runId, threadId: agent.threadId,
                    items: itemsRef.current.slice(-60), agentMessages: agent.messages }));
            }
            const subscriber = {
                onQuestionResumed(interruptId) {
                    updateRunItems(current => current.map(item => item.kind === "question" && item.interruptId === interruptId
                        ? { ...item, status: "resolved" } : item));
                },
                onRunStartedEvent() {
                    if (sessionRef.current === runSession)
                        setRunAccepted(true);
                },
                onQuestion(question) {
                    updateRunItems(current => current.some(item => item.id === question.id) ? current : [...current, question]);
                },
                onTextMessageStartEvent({ event }) {
                    latestAssistantMessageId = event.messageId;
                    updateRunItems((current) => current.some((item) => item.id === event.messageId)
                        ? current
                        : [
                            ...current,
                            {
                                kind: "message",
                                id: event.messageId,
                                role: "assistant",
                                content: "",
                                streaming: true,
                            },
                        ]);
                },
                onTextMessageContentEvent({ event }) {
                    updateRunItems((current) => current.map((item) => item.kind === "message" && item.id === event.messageId
                        ? { ...item, content: `${item.content}${event.delta}` }
                        : item));
                },
                onTextMessageEndEvent({ event }) {
                    updateRunItems((current) => current.map((item) => item.kind === "message" && item.id === event.messageId
                        ? { ...item, streaming: false }
                        : item));
                },
                onToolCallStartEvent({ event }) {
                    updateRunItems((current) => current.some((item) => item.kind === "tool" && item.id === event.toolCallId)
                        ? current
                        : [
                            ...current,
                            {
                                kind: "tool",
                                id: event.toolCallId,
                                name: event.toolCallName,
                                arguments: "",
                                status: "preparing",
                            },
                        ]);
                },
                onToolCallArgsEvent({ event }) {
                    updateRunItems((current) => current.map((item) => item.kind === "tool" && item.id === event.toolCallId
                        ? item.name === "ask_user_question" && item.arguments === event.delta
                            ? item
                            : { ...item, arguments: `${item.arguments}${event.delta}` }
                        : item));
                },
                onToolCallEndEvent({ event }) {
                    updateRunItems((current) => current.map((item) => item.kind === "tool" && item.id === event.toolCallId
                        ? { ...item, status: "running" }
                        : item));
                },
                onToolCallResultEvent({ event }) {
                    const metadata = isRecord(event.metadata) ? event.metadata : {};
                    const failed = metadata.status === "error" || typeof metadata.error === "string";
                    updateRunItems((current) => current.map((item) => item.kind === "tool" && item.id === event.toolCallId
                        ? {
                            ...item,
                            result: typeof event.content === "string" ? event.content : JSON.stringify(event.content),
                            ...(typeof metadata.error === "string"
                                ? { error: metadata.error }
                                : {}),
                            status: failed ? "failed" : "completed",
                        }
                        : item));
                },
                onStepStartedEvent({ event }) {
                    projectStep("started", event);
                },
                onStepFinishedEvent({ event }) {
                    projectStep("finished", event);
                },
                onRunErrorEvent({ event }) {
                    runErrorHandled = true;
                    runErrorCode = event.code;
                    const errorReceipt = isRecord(event.metadata) && isCreatorRunReceipt(event.metadata.receipt) ? event.metadata.receipt : undefined;
                    if (response !== undefined) {
                        updateRunItems(current => current.map(item => item.kind === "question" && item.id === response.question.id && item.status !== "resolved"
                            ? { ...item, status: (questionContextIsGone(event.code) ? "stale" : "pending") } : item));
                    }
                    updateRunItems((current) => [
                        ...current.map((item) => item.kind === "message" && item.streaming === true
                            ? { ...item, streaming: false }
                            : item.kind === "tool" &&
                                (item.status === "preparing" || item.status === "running")
                                ? { ...item, status: "failed", error: event.message }
                                : item.kind === "stage" && item.status === "running"
                                    ? interruptCreatorStage(item, event.message, localeMessages)
                                    : item),
                        {
                            kind: "message",
                            id: crypto.randomUUID(),
                            role: "error",
                            content: creatorRunOutcomeText(event.metadata, event.message, localeMessages),
                            ...(errorReceipt ? { receipt: errorReceipt } : {}),
                        },
                    ]);
                },
            };
            const result = reconnectRunId !== undefined ? await agent.reconnect(reconnectRunId, subscriber)
                : response === undefined ? await agent.run(subscriber, runId)
                    : await agent.resumeInterrupt(response.question.interruptId, response.answers, subscriber, runId);
            completed = true;
            if (isRecord(result.result) && result.result.completion === "blocked") {
                updateRunItems(current => current.map(item => item.kind === "message" && item.id === latestAssistantMessageId
                    ? { ...item, content: creatorRunOutcomeText(result.result, item.content, localeMessages) }
                    : item));
            }
            if (response !== undefined && !runErrorHandled) {
                updateRunItems(current => current.map(item => item.kind === "question" && item.id === response.question.id
                    ? { ...item, status: "resolved" } : item));
            }
            updateRunItems((current) => {
                const stageItems = current.filter((item) => item.kind === "stage");
                const reconciled = reconcileCreatorStagesFromRunResult(stageItems, result.result);
                let stageIndex = 0;
                const next = current.map((item) => {
                    if (item.kind !== "stage")
                        return item;
                    const replacement = reconciled[stageIndex];
                    stageIndex += 1;
                    return replacement ?? item;
                });
                return stageIndex < reconciled.length
                    ? [...next, ...reconciled.slice(stageIndex)]
                    : next;
            });
            const receipt = receiptFromRunResult(result.result, localeMessages);
            if (receipt !== undefined) {
                if (latestAssistantMessageId === undefined) {
                    updateRunItems((current) => [
                        ...current,
                        {
                            kind: "message",
                            id: crypto.randomUUID(),
                            role: "assistant",
                            content: localeMessages.creatorWorkbench.creatorCompletedThisRequest,
                            receipt,
                            streaming: false,
                        },
                    ]);
                }
                else {
                    const receiptMessageId = latestAssistantMessageId;
                    updateRunItems((current) => current.map((item) => item.kind === "message" && item.id === receiptMessageId
                        ? { ...item, receipt, streaming: false }
                        : item));
                }
            }
        }
        catch (error) {
            const code = error instanceof Error && "code" in error ? String(error.code) : "";
            if (code === "CREATOR_RUN_NOT_FOUND" || code === "CREATOR_WORKSPACE_CHANGED")
                completed = true;
            if (response !== undefined) {
                updateRunItems(current => current.map(item => item.kind === "question" && item.id === response.question.id && item.status !== "resolved"
                    ? { ...item, status: (questionContextIsGone(runErrorCode) ? "stale" : "pending") } : item));
            }
            if (!runErrorHandled) {
                const message = creatorRuntimeErrorMessage(code, error instanceof Error ? error.message : String(error), localeMessages);
                updateRunItems((current) => [
                    ...current.map((item) => item.kind === "message" && item.streaming === true
                        ? { ...item, streaming: false }
                        : item.kind === "tool" &&
                            (item.status === "preparing" || item.status === "running")
                            ? { ...item, status: "failed", error: message }
                            : item.kind === "stage" && item.status === "running"
                                ? interruptCreatorStage(item, message, localeMessages)
                                : item),
                    {
                        kind: "message",
                        id: crypto.randomUUID(),
                        role: "error",
                        content: message,
                    },
                ]);
            }
        }
        finally {
            if (sessionRef.current === runSession) {
                runInFlightRef.current = false;
                if (completed || runErrorHandled)
                    sessionStorage.removeItem(activeRunKey(runWorkspaceId));
                saveConversation(agent, itemsRef.current, runWorkspaceId);
                setIsRunning(false);
                setRunAccepted(false);
                setStopBusy(false);
            }
        }
    };
    useEffect(() => {
        if (recoveringRunId === null || workspaceState?.status !== "ready")
            return;
        setRecoveringRunId(null);
        void submit(undefined, undefined, undefined, recoveringRunId);
    }, [recoveringRunId, workspaceState]);
    const stopCurrentRun = async () => {
        const agent = agentRef.current;
        if (agent === null || !isRunning || !runAccepted || stopBusy)
            return;
        setStopBusy(true);
        try {
            await agent.control("stop");
        }
        catch (error) {
            setStopBusy(false);
            updateItems(current => [...current, { kind: "message", id: crypto.randomUUID(), role: "error",
                    content: error instanceof Error ? error.message : String(error) }]);
        }
    };
    const abandonQuestion = async (question) => {
        const agent = agentRef.current;
        if (agent === null || isRunning || question.status !== "pending")
            return;
        try {
            await agent.control("abandon", question.interruptId);
            updateItems(current => [...current.map(item => item.kind === "question" && item.id === question.id
                    ? { ...item, status: "stale" } : item),
                { kind: "message", id: crypto.randomUUID(), role: "assistant",
                    content: localeMessages.creatorWorkbench.thisDevelopmentTaskWasAbandonedPreviouslyCommittedChanges }]);
        }
        catch (error) {
            updateItems(current => [...current, { kind: "message", id: crypto.randomUUID(), role: "error",
                    content: error instanceof Error ? error.message : String(error) }]);
        }
    };
    const undoCreatorRun = async (runId) => {
        const agent = agentRef.current;
        if (agent === null || commandInFlight.current || isRunning || undoRunId !== null || reapplyRunId !== null || hasPendingCreatorQuestion(itemsRef.current))
            return;
        setUndoRunId(runId);
        try {
            const { reapplyable } = await agent.undo(runId);
            updateItems(current => current.map(item => (item.kind === "message" || item.kind === "command") && item.receipt?.transaction?.runId === runId
                ? { ...item, receipt: { ...item.receipt, transaction: { ...item.receipt.transaction, undoable: false, undone: true, reapplyable, reapplied: false } } }
                : item));
            setSetupValidationEpoch(current => current + 1);
        }
        catch (error) {
            updateItems(current => [...current, { kind: "message", id: crypto.randomUUID(), role: "error",
                    content: error instanceof Error ? error.message : String(error) }]);
        }
        finally {
            setUndoRunId(null);
        }
    };
    const reapplyCreatorRun = async (runId) => {
        const agent = agentRef.current;
        if (agent === null || commandInFlight.current || isRunning || undoRunId !== null || reapplyRunId !== null || hasPendingCreatorQuestion(itemsRef.current))
            return;
        setReapplyRunId(runId);
        try {
            await agent.reapply(runId);
            updateItems(current => current.map(item => (item.kind === "message" || item.kind === "command") && item.receipt?.transaction?.runId === runId
                ? { ...item, receipt: { ...item.receipt, transaction: { ...item.receipt.transaction, undoable: true, undone: false, reapplied: true } } }
                : item));
            setSetupValidationEpoch(current => current + 1);
        }
        catch (error) {
            updateItems(current => [...current, { kind: "message", id: crypto.randomUUID(), role: "error",
                    content: error instanceof Error ? error.message : String(error) }]);
        }
        finally {
            setReapplyRunId(null);
        }
    };
    const clearConversation = () => {
        if (commandInFlight.current || isRunning || hasPendingCreatorQuestion(itemsRef.current) ||
            !((workspaceState?.status === "ready") && workspaceState.runtime.status === "ready")) {
            return;
        }
        if (storedRun(workspaceIdRef.current, agentRef.current.threadId, localeMessages)) {
            updateItems(current => [...current, { kind: "message", id: crypto.randomUUID(), role: "error", content: localeMessages.creatorWorkbench.runConnectionLost }]);
            return;
        }
        const nextThreadId = crypto.randomUUID();
        const agent = new CreatorAgentClient(workspaceIdRef.current, nextThreadId);
        agentRef.current = agent;
        itemsRef.current = [];
        setItems([]);
        setInput("");
        setThreadId(nextThreadId);
        if (workspaceIdRef.current !== undefined)
            saveConversation(agent, [], workspaceIdRef.current);
    };
    const selectWorkspace = async (event) => {
        event.preventDefault();
        if (workspaceBusy || initializingRef.current || workspacePath.trim() === "" || hasPendingCreatorQuestion(itemsRef.current))
            return;
        setWorkspaceBusy(true);
        setWorkspaceError(null);
        try {
            installWorkspace(await selectWorkspaceProject(workspacePath.trim(), localeMessages));
            setShowWorkspaceSelector(false);
        }
        catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : String(error));
        }
        finally {
            setWorkspaceBusy(false);
        }
    };
    const chooseWorkspace = async () => {
        if (workspaceState === null || workspaceBusy || initializingRef.current || hasPendingCreatorQuestion(itemsRef.current))
            return;
        setWorkspaceBusy(true);
        setWorkspacePicking(true);
        setWorkspaceError(null);
        try {
            const result = await chooseWorkspaceProject(localeMessages);
            if (result.status === "cancelled")
                return;
            if (result.status === "none")
                throw new Error(localeMessages.creatorWorkbench.noProjectFolderSelected);
            installWorkspace(result);
            setWorkspacePath(result.workspace.displayPath);
            setShowWorkspaceSelector(false);
        }
        catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : String(error));
        }
        finally {
            setWorkspacePicking(false);
            setWorkspaceBusy(false);
        }
    };
    const clearWorkspace = async () => {
        if (workspaceBusy || initializingRef.current || hasPendingCreatorQuestion(itemsRef.current))
            return;
        setWorkspaceBusy(true);
        setWorkspaceError(null);
        sessionRef.current += 1;
        agentRef.current?.abort();
        try {
            installWorkspace(await clearWorkspaceProject(localeMessages));
            setWorkspacePath("");
            setShowWorkspaceSelector(true);
        }
        catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : String(error));
        }
        finally {
            setWorkspaceBusy(false);
        }
    };
    const refreshCreator = async () => {
        if (refreshInFlight.current || workspaceBusy || isRunning || initializingRef.current || hasPendingCreatorQuestion(itemsRef.current))
            return;
        const id = workspaceIdRef.current, agent = agentRef.current;
        if (id && agent && workspaceState?.status === "ready" && workspaceState.runtime.status === "ready" && storedRun(id, agent.threadId, localeMessages)) {
            installWorkspace(workspaceState);
            return;
        }
        if (panel.current?.querySelector('[aria-busy="true"]')) {
            setRefreshMessage(localeMessages.creatorWorkbench.refreshAfterTheCurrentOperationFinishes);
            return;
        }
        refreshInFlight.current = true;
        setRefreshing(true);
        setRefreshMessage("");
        const currentSession = sessionRef.current;
        try {
            const next = await refreshWorkspaceProject(localeMessages);
            if (sessionRef.current !== currentSession)
                return;
            const id = next.status === "none" ? undefined : next.workspace.id;
            if (next.status === "ready" && workspaceState?.status === "ready" && id === workspaceIdRef.current) {
                setWorkspaceState(next);
                if (next.runtime.status !== "ready")
                    agentRef.current = null;
                else if (!agentRef.current)
                    agentRef.current = new CreatorAgentClient(id, threadId, storedConversation(id, localeMessages).agentMessages);
            }
            else
                installWorkspace(next);
            if (!id) {
                setRefreshMessage(localeMessages.creatorWorkbench.projectStateRefreshedOpenAProjectFirst);
                return;
            }
            if (next.status !== "ready") {
                setRefreshMessage(localeMessages.creatorWorkbench.refreshWorkspaceNotReady);
                return;
            }
            if (next.runtime.status !== "ready") {
                setRefreshMessage(localeMessages.creatorWorkbench.refreshRuntimeUnavailable);
                return;
            }
            const refreshedSession = sessionRef.current;
            const data = { projectId: id };
            const results = await Promise.allSettled([
                readAgentConnection(id, undefined, localeMessages).then(value => { data.connection = value; }),
                readRefreshJson("/__agent-ui/creator/mock", undefined, localeMessages).then(value => { data.mock = value; }),
                readRefreshJson("/__agent-ui/creator/mock/compatibility", undefined, localeMessages).then(value => { data.compatibility = value; if (value.status !== "checked")
                    throw new Error(localeMessages.creatorWorkbench.couldNotCheckDemoResources); }),
                readRefreshJson("/__creator/updates/check", { workspaceId: id }, localeMessages).then(value => { data.updates = value; }),
            ]);
            if (workspaceIdRef.current !== id || sessionRef.current !== refreshedSession)
                return;
            publishCreatorRefresh(data);
            if (data.connection)
                window.dispatchEvent(new CustomEvent(CONNECTION_CHANGED, { detail: { workspaceId: id, state: data.connection } }));
            const names = [localeMessages.creatorWorkbench.connectionSettings, localeMessages.creatorWorkbench.mockFilesAndService, localeMessages.creatorWorkbench.demoResources, localeMessages.creatorWorkbench.pluginUpdates];
            const failed = results.flatMap((result, index) => result.status === "rejected" ? [names[index]] : []);
            setRefreshMessage(failed.length ? formatLocaleMessage(localeMessages.creatorWorkbench.refreshPartiallyCompletedCouldNotBeReadPlease, failed.join("、")) : localeMessages.creatorWorkbench.refreshedProjectStateConnectionSettingsMockFilesDemo);
        }
        catch {
            setRefreshMessage(localeMessages.creatorWorkbench.couldNotRefreshTheProjectMakeSureThe);
        }
        finally {
            refreshInFlight.current = false;
            setRefreshing(false);
        }
    };
    const refreshWorkspace = async () => {
        if (workspaceBusy || initializingRef.current || hasPendingCreatorQuestion(itemsRef.current))
            return;
        setWorkspaceBusy(true);
        setWorkspaceError(null);
        if (workspaceState?.status === "uninitialized") {
            invalidateSetupValidation();
            setSetupDraft((current) => ({ ...current, validation: { status: "idle" } }));
        }
        sessionRef.current += 1;
        agentRef.current?.abort();
        try {
            const refreshed = await refreshWorkspaceProject(localeMessages);
            installWorkspace(refreshed);
            if (refreshed.status === "uninitialized")
                setSetupValidationEpoch((current) => current + 1);
        }
        catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : String(error));
            if (workspaceState?.status === "uninitialized")
                setSetupValidationEpoch((current) => current + 1);
        }
        finally {
            setWorkspaceBusy(false);
        }
    };
    const changeSetupMode = (mode) => {
        if (initializingRef.current || workspaceState?.status !== "uninitialized")
            return;
        invalidateSetupValidation();
        setSetupDraft((current) => ({ ...current, mode, validation: { status: "idle" },
            error: setupNeedsRefresh ? current.error : null }));
    };
    const changeSetupSourceRoot = (sourceRoot) => {
        if (initializingRef.current || workspaceState?.status !== "uninitialized")
            return;
        invalidateSetupValidation();
        setSetupDraft((current) => ({ ...current, sourceRoot, validation: { status: "idle" },
            error: setupNeedsRefresh ? current.error : null }));
    };
    const canInitialize = canInitializeCreatorProject({
        workspaceStatus: workspaceState?.status ?? null, draft: setupDraft, workspaceBusy, setupNeedsRefresh,
    });
    const initializeWorkspaceProject = async () => {
        if (!canInitialize || initializingRef.current || setupDraft.mode === null)
            return;
        const workspaceId = workspaceIdRef.current;
        if (workspaceId === undefined)
            return;
        const dependencyPlan = setupDraft.validation.status === "valid" ? setupDraft.validation.result.dependencyPlan : undefined;
        const preparingDependencies = dependencyPlan !== undefined &&
            (Object.keys(dependencyPlan.dependencies).length > 0 || Object.keys(dependencyPlan.devDependencies).length > 0);
        if (dependencyPlan?.installRequired && !preparingDependencies) {
            invalidateSetupValidation();
            setSetupDraft(current => ({ ...current, validation: { status: "idle" }, error: null }));
            setSetupValidationEpoch(current => current + 1);
            return;
        }
        initializingRef.current = true;
        setSetupDraft((current) => ({ ...current, initializing: true, error: null }));
        const planId = setupDraft.validation.status === "valid"
            ? setupDraft.validation.result.compatibilityPlan?.id ?? setupDraft.validation.result.dependencyPlan?.id : undefined;
        try {
            const result = await initializeWorkspaceProjectRequest({
                mode: setupDraft.mode,
                sourceRoot: setupDraft.sourceRoot,
                ...(planId ? { planId } : {}),
            }, localeMessages);
            if (workspaceIdRef.current === workspaceId) {
                installWorkspace(result);
                if (result.status === "uninitialized") {
                    if (preparingDependencies) {
                        setSetupNeedsRefresh(false);
                        setSetupDraft(current => ({ ...current, validation: { status: "idle" }, error: null }));
                        setSetupValidationEpoch(current => current + 1);
                    }
                    else {
                        setSetupNeedsRefresh(true);
                        setSetupDraft((current) => ({ ...current, validation: { status: "idle" },
                            error: { message: localeMessages.creatorWorkbench.initializationDidNotReportAReadyStateRefresh } }));
                    }
                }
            }
        }
        catch (error) {
            if (workspaceIdRef.current !== workspaceId)
                return;
            if (shouldRefreshAfterInitializeError(error)) {
                setSetupNeedsRefresh(true);
                try {
                    const refreshed = await refreshWorkspaceProject(localeMessages);
                    if (workspaceIdRef.current !== workspaceId)
                        return;
                    installWorkspace(refreshed);
                    if (refreshed.status === "uninitialized") {
                        setSetupDraft((current) => ({ ...current, validation: { status: "idle" },
                            error: { message: localeMessages.creatorWorkbench.initializationOutcomeUnconfirmedRefreshProjectStateAndRetry, ...(error.code === undefined ? {} : { code: error.code }) } }));
                    }
                }
                catch (refreshError) {
                    if (workspaceIdRef.current === workspaceId) {
                        setSetupDraft((current) => ({ ...current, validation: { status: "idle" },
                            error: { message: formatLocaleMessage(localeMessages.creatorWorkbench.initializationOutcomeUnconfirmedCouldNotRefreshProjectState, setupError(refreshError).message), ...(error.code === undefined ? {} : { code: error.code }) } }));
                    }
                }
            }
            else {
                setSetupDraft((current) => ({ ...current, validation: { status: "idle" }, error: setupError(error) }));
                setSetupValidationEpoch(current => current + 1);
            }
        }
        finally {
            initializingRef.current = false;
            if (workspaceIdRef.current === workspaceId) {
                setSetupDraft((current) => ({ ...current, initializing: false }));
            }
        }
    };
    const applyCommandSelection = (choice) => {
        if (choice.input !== undefined)
            setInput(choice.input);
        else if (choice.execute !== undefined)
            void executeSlashCommand(choice.execute);
    };
    const pickCommand = (id) => applyCommandSelection(commandState.pick(id));
    const handleKeyDown = (event) => {
        const selection = commandState.keyDown(event);
        if (selection?.handled) {
            applyCommandSelection(selection);
            return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
                return;
            event.preventDefault();
            void submit();
        }
    };
    const startPanelResize = (event) => {
        const currentWidth = panel.current?.getBoundingClientRect().width;
        if (currentWidth === undefined) {
            return;
        }
        event.preventDefault();
        resizeStart.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            width: currentWidth,
        };
        setIsResizing(true);
    };
    const resizePanelWithKeyboard = (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
            return;
        }
        event.preventDefault();
        const currentWidth = panelWidth ?? panel.current?.getBoundingClientRect().width;
        if (currentWidth === undefined) {
            return;
        }
        const direction = event.key === "ArrowLeft" ? 1 : -1;
        setPanelWidth(clampCreatorPanelWidth(currentWidth + direction * CREATOR_PANEL_KEYBOARD_STEP));
    };
    const creatorRuntimeReady = (workspaceState?.status === "ready") && workspaceState.runtime.status === "ready";
    const questionPending = hasPendingCreatorQuestion(items);
    const pendingQuestionHint = localeMessages.creatorWorkbench.answerTheCurrentQuestionFirst;
    return (_jsxs("div", { className: "creator-workbench", "data-creator-layout": layout, "data-creator-panel-open": isOpen, "data-creator-mock-open": mockPanelOpen, "data-creator-tool-open": mockPanelOpen || agentPanelOpen || updatePageOpen, "data-creator-panel-resizing": isResizing, style: panelWidth === null
            ? undefined
            : {
                "--creator-panel-width": `${panelWidth}px`,
            }, children: [layout === "dock" ? workspaceState?.status === "ready" && workspaceState.workspace.id === previewWorkspaceId
                ? (typeof children === "function" ? children({ threadId, workspaceId: workspaceState.workspace.id }) : children)
                : null : workspaceState !== null && (workspaceState.status === "ready") && workspaceState.workspace.id === previewWorkspaceId ? (_jsx(CreatorWorkbenchPreview, { threadId: threadId, workspaceId: workspaceState.workspace.id, children: children }, commandPreviewRevision)) : (_jsx("section", { className: "creator-workbench-preview creator-workbench-preview-placeholder", "aria-label": localeMessages.creatorWorkbench.projectPreview, children: workspaceState?.status === "uninitialized" ? (_jsxs(_Fragment, { children: [_jsx("strong", { children: localeMessages.creatorWorkbench.agentUIIsNotInitialized }), _jsx("p", { children: localeMessages.creatorWorkbench.chooseAProductModeAndInitializeAgentUI })] })) : workspaceState === null || workspaceState.status === "none" ? (_jsx("strong", { children: localeMessages.creatorWorkbench.selectAProjectFirst })) : (_jsxs(_Fragment, { children: [_jsx("strong", { children: localeMessages.creatorWorkbench.openYourProjectSDevelopmentPage }), _jsx("p", { children: localeMessages.creatorWorkbench.yourProjectSDevelopmentServerRendersThePage })] })) })), isOpen ? (_jsxs("aside", { className: "creator-panel creator-ui-scope", "aria-label": localeMessages.creatorWorkbench.creator, ref: panel, children: [layout === "dock" ? null : _jsx("div", { "aria-label": localeMessages.creatorWorkbench.resizeCreatorPanel, "aria-orientation": "vertical", className: "creator-panel-resizer", onDoubleClick: () => setPanelWidth(null), onKeyDown: resizePanelWithKeyboard, onPointerDown: startPanelResize, role: "separator", tabIndex: 0, title: localeMessages.creatorWorkbench.dragToResizeDoubleClickToRestoreThe }), _jsxs("header", { className: "creator-panel-header", children: [_jsxs("div", { className: "creator-panel-brand", title: localeMessages.creatorWorkbench.creatorDevelopmentOnly, children: [_jsx("div", { className: "creator-panel-brand-icon", children: _jsx(PanelsTopLeft, { "aria-hidden": "true" }) }), _jsx("h1", { children: localeMessages.creatorWorkbench.creator })] }), _jsxs("div", { className: "creator-panel-header-actions creator-ui-scope", children: [_jsxs("div", { className: "creator-header-quick-actions", children: [_jsxs("div", { className: "creator-workspace-control", ref: workspaceControl, children: [_jsx(Button, { size: "icon-sm", variant: "ghost", "aria-controls": "creator-workspace-menu", "aria-expanded": showWorkspaceSelector, "aria-label": workspaceState !== null && workspaceState.status !== "none"
                                                            ? formatLocaleMessage(localeMessages.creatorWorkbench.currentProjectClickToSwitchProjects, workspaceState.workspace.name) : localeMessages.creatorWorkbench.chooseProjectFolder, className: "creator-workspace-trigger", disabled: workspaceBusy || setupDraft.initializing || questionPending, onClick: () => {
                                                            if (workspaceState !== null && workspaceState.status !== "none")
                                                                setWorkspacePath(workspaceState.workspace.displayPath);
                                                            setShowWorkspaceSelector(current => !current);
                                                        }, title: localeMessages.creatorWorkbench.openOrSwitchProject, type: "button", children: _jsx(FolderOpen, { "aria-hidden": "true" }) }), showWorkspaceSelector ? (_jsxs("section", { className: "creator-workspace-menu", id: "creator-workspace-menu", "aria-label": localeMessages.creatorWorkbench.chooseFrontendProjectFolder, children: [_jsxs("header", { className: "creator-workspace-menu-header", children: [_jsx("h2", { children: workspaceState !== null && workspaceState.status !== "none" ? localeMessages.creatorWorkbench.currentProject : localeMessages.creatorWorkbench.openProject }), _jsx(Button, { size: "icon-xs", variant: "ghost", type: "button", "aria-label": localeMessages.creatorWorkbench.closeProjectSelection, onClick: () => { setShowWorkspaceSelector(false); workspaceControl.current?.querySelector(".creator-workspace-trigger")?.focus(); }, children: _jsx(X, { "aria-hidden": "true" }) })] }), workspaceState !== null && workspaceState.status !== "none" ? (_jsxs("div", { className: "creator-workspace-current", children: [_jsxs("div", { className: "creator-workspace-identity", children: [_jsx(FolderOpen, { "aria-hidden": "true" }), _jsx("strong", { title: workspaceState.workspace.name, children: workspaceState.workspace.name })] }), _jsx("div", { className: "creator-workspace-metadata", children: _jsx(Badge, { variant: "secondary", "data-project-ready": workspaceState.status === "ready", children: workspaceState.status === "ready" ? localeMessages.creatorWorkbench.agentUIConnected : workspaceState.status === "uninitialized" ? localeMessages.creatorWorkbench.notInitialized : localeMessages.creatorWorkbench.repairNeeded }) }), _jsx("p", { className: "creator-workspace-purpose", children: localeMessages.creatorWorkbench.creatorSavesChangesToThisProject }), _jsxs("details", { className: "creator-workspace-info", children: [_jsxs("summary", { children: [_jsx(ChevronDown, { "aria-hidden": "true" }), localeMessages.creatorWorkbench.pathsAndIntegration] }), _jsxs("div", { className: "creator-workspace-info-panel", children: [_jsxs("dl", { children: [_jsxs("div", { className: "creator-workspace-path-field", children: [_jsx("dt", { children: localeMessages.creatorWorkbench.projectFolder }), _jsx("dd", { children: _jsx("code", { children: workspaceState.workspace.displayPath }) })] }), workspaceState.status === "ready" ? _jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("dt", { children: localeMessages.creatorWorkbench.agentUISourceDirectory }), _jsx("dd", { children: _jsx("code", { children: workspaceState.project.sourceRoot }) })] }), _jsxs("div", { children: [_jsx("dt", { children: localeMessages.creatorWorkbench.productMode }), _jsx("dd", { children: ({ assistant: localeMessages.creatorWorkbench.assistant, embedded: localeMessages.creatorWorkbench.embedded, platform: localeMessages.creatorWorkbench.workbench })[workspaceState.project.mode] })] })] }) : null] }), _jsx("div", { className: "creator-workspace-info-actions", children: _jsxs(Button, { size: "xs", variant: "ghost", type: "button", disabled: workspaceBusy || setupDraft.initializing || questionPending, title: questionPending ? pendingQuestionHint : localeMessages.creatorWorkbench.recheckAgentUIIntegration, onClick: () => void refreshWorkspace(), children: [_jsx(RefreshCw, { "aria-hidden": "true", className: workspaceBusy ? "creator-tool-group-spinner" : undefined }), workspaceBusy ? localeMessages.creatorWorkbench.checking : localeMessages.creatorWorkbench.recheckIntegration] }) })] })] }), (workspaceState.status === "ready") && workspaceState.warnings?.length ? (_jsxs("div", { className: "creator-workspace-warnings", role: "status", children: [_jsx("strong", { children: localeMessages.creatorWorkbench.agentUIInitializationNeedsRecoveryChecks }), workspaceState.warnings.map((issue, index) => (_jsx("span", { children: issue.code === "AGENT_UI_INITIALIZATION_RECOVERY_REQUIRED"
                                                                                    ? localeMessages.creatorWorkbench.initializationWasCommittedButCleanupDidNotFinish
                                                                                    : setupIssueMessage(issue, localeMessages) }, `${issue.code}-${index}`)))] })) : null] })) : null, _jsxs("div", { className: "creator-workspace-selector", children: [workspaceState?.status === "none" ? _jsx("p", { className: "creator-workspace-purpose", children: localeMessages.creatorWorkbench.openAFrontendProjectFolderCreatorWillCheck }) : null, _jsxs(Button, { size: "sm", variant: "outline", className: "creator-workspace-browse", type: "button", disabled: workspaceState === null || workspaceBusy || setupDraft.initializing || questionPending, onClick: () => void chooseWorkspace(), children: [_jsx(FolderOpen, { "aria-hidden": "true" }), workspacePicking ? localeMessages.creatorWorkbench.waitingForFolderSelection : workspaceState !== null && workspaceState.status !== "none" ? localeMessages.creatorWorkbench.openAnotherProject : localeMessages.creatorWorkbench.openFrontendProject] }), workspacePicking ? _jsx("span", { role: "status", children: localeMessages.creatorWorkbench.chooseAProjectInTheSystemWindowOr }) : null, _jsxs("details", { children: [_jsx("summary", { children: localeMessages.creatorWorkbench.openByPath }), _jsxs("form", { onSubmit: selectWorkspace, children: [_jsx("label", { htmlFor: "creator-workspace-path", children: localeMessages.creatorWorkbench.absoluteProjectFolderPath }), _jsx(Input, { id: "creator-workspace-path", value: workspacePath, disabled: workspaceBusy || setupDraft.initializing || questionPending, onChange: (event) => setWorkspacePath(event.target.value), placeholder: "/path/to/project", autoComplete: "off", spellCheck: false }), _jsx(Button, { size: "sm", variant: "secondary", type: "submit", disabled: workspaceBusy || setupDraft.initializing || questionPending || workspacePath.trim() === "", children: localeMessages.creatorWorkbench.openProject })] })] })] }), workspaceState !== null && workspaceState.status !== "none" ? _jsxs("div", { className: "creator-workspace-close", children: [_jsx(Button, { size: "sm", variant: "ghost", type: "button", disabled: workspaceBusy || setupDraft.initializing || questionPending, title: questionPending ? pendingQuestionHint : localeMessages.creatorWorkbench.closeTheProjectAndKeepItsFiles, onClick: () => void clearWorkspace(), children: localeMessages.creatorWorkbench.closeCurrentProject }), _jsx("span", { children: localeMessages.creatorWorkbench.projectFilesWillBeKept })] }) : null, workspaceError === null ? null : _jsx("p", { role: "alert", children: localizeCreatorPresentation(workspaceError, localeMessages) })] })) : null] }), _jsx("div", { className: "creator-header-updates", ref: setUpdateNotificationTarget }), _jsx(Button, { variant: "ghost", size: "icon-sm", "aria-label": localeMessages.creatorWorkbench.refresh, title: localeMessages.creatorWorkbench.reloadCurrentProjectAndPanelData, disabled: refreshing || workspaceBusy || isRunning || questionPending || setupDraft.initializing, onClick: () => void refreshCreator(), children: _jsx(RefreshCw, { "aria-hidden": "true", className: refreshing ? "creator-tool-group-spinner" : undefined }) }), _jsx(CreatorSettings, { ready: workspaceState?.status === "ready", onAgent: () => { setAgentPanelOpen(true); setMockPanelOpen(false); setUpdatePageOpen(false); }, onMock: () => { setMockPanelOpen(true); setAgentPanelOpen(false); setUpdatePageOpen(false); }, busy: isRunning || questionPending, onCheckUpdates: () => { setAgentPanelOpen(false); setMockPanelOpen(false); setUpdatePageOpen(true); setUpdateCheckRequest(value => value + 1); } })] }), _jsx("div", { className: "creator-panel-dev-studio-dock", "data-slot": "agent-ui-dev-studio-dock" }), layout === "dock" ? null : _jsx(Button, { variant: "ghost", size: "icon-sm", "aria-label": localeMessages.creatorWorkbench.closeCreatorPanel, onClick: () => setIsOpen(false), type: "button", children: _jsx(X, { "aria-hidden": "true" }) })] })] }), _jsxs("div", { className: "creator-panel-body", children: [refreshing || refreshMessage ? _jsx("p", { className: "creator-refresh-status", role: "status", children: refreshing ? localeMessages.creatorWorkbench.reloadingProjectData : refreshMessage }) : null, workspaceState?.status === "ready" ? _jsx(CreatorPluginUpdates, { workspaceId: workspaceState.workspace.id, busy: isRunning || questionPending, modelReady: creatorRuntimeReady, checkRequest: updateCheckRequest, notificationTarget: updateNotificationTarget, pageOpen: updatePageOpen, onPageChange: handleUpdatePageChange, onModelMerge: prompt => { void submit(undefined, undefined, prompt); } }, workspaceState.workspace.id) : null, agentPanelOpen || mockPanelOpen ? _jsxs("div", { className: "creator-tool-header", children: [_jsx(Button, { size: "icon-sm", variant: "ghost", "aria-label": localeMessages.creatorWorkbench.backToConversation, onClick: () => { setAgentPanelOpen(false); setMockPanelOpen(false); }, children: _jsx(ArrowLeft, { "aria-hidden": "true" }) }), _jsx("h2", { children: agentPanelOpen ? localeMessages.creatorWorkbench.connectAgent : localeMessages.creatorWorkbench.demosAndReplay })] }) : null, workspaceState?.status === "ready" && agentPanelOpen ? _jsx(AgentConnectionPanel, { workspaceId: workspaceState.workspace.id, visible: true }, `connection:${workspaceState.workspace.id}`) : null, mockPanelOpen ? _jsx(MockServicePanel, { ...(workspaceState && workspaceState.status !== "none" ? { projectId: workspaceState.workspace.id, projectPath: workspaceState.workspace.displayPath } : {}) }) : null, _jsx("div", { className: "creator-panel-dev-studio-panel", "data-slot": "agent-ui-dev-studio-panel" }), workspaceState?.status === "uninitialized" ? (_jsx(CreatorProjectSetup, { infoState: setupInfo, draft: setupDraft, canInitialize: canInitialize, debug: creatorDebug, onModeChange: changeSetupMode, onSourceRootChange: changeSetupSourceRoot, onInitialize: () => void initializeWorkspaceProject(), onRetryInfo: () => { if (setupWorkspaceId !== undefined)
                                    loadSetupInfo(setupWorkspaceId); } })) : _jsxs("div", { className: "creator-panel-messages", ref: messageList, style: updatePageOpen ? { display: "none" } : undefined, children: [workspaceState?.status === "ready" ? (_jsx(CreatorProjectIntegrationGuide, { mode: workspaceState.project.mode, sourceRoot: workspaceState.project.sourceRoot, hostFramework: workspaceState.workspace.hostFramework, onBuild: workspaceState.workspace.hostFramework === "vue" ? () => buildCompatibilityProjectRequest(localeMessages) : undefined, buildDisabled: isRunning || commandBusy || workspaceBusy }, workspaceState.workspace.id)) : null, workspaceState?.status === "broken" ? (_jsxs("div", { className: "creator-panel-empty creator-panel-empty--error", children: [_jsx(AlertCircle, { "aria-hidden": "true" }), _jsx("strong", { children: workspaceState.issues.some(issue => issue.code.startsWith("CREATOR_")) ? localeMessages.creatorWorkbench.creatorServiceTemporarilyUnavailable : localeMessages.creatorWorkbench.projectConfigurationNeedsRepair }), _jsx("p", { children: workspaceState.issues.some(issue => issue.code === "CREATOR_OPERATOR_RESTART_REQUIRED") ? localeMessages.creatorWorkbench.operatorRestartRequired : localeMessages.creatorWorkbench.projectInspectionFailedAdvice }), _jsxs(Button, { size: "sm", variant: "outline", type: "button", disabled: workspaceBusy, onClick: () => void refreshWorkspace(), children: [_jsx(RefreshCw, { "aria-hidden": "true" }), localeMessages.creatorWorkbench.recheckProject] }), _jsxs("details", { children: [_jsx("summary", { children: localeMessages.creatorWorkbench.viewTechnicalDetails }), workspaceState.issues.map((issue, index) => _jsxs("pre", { children: [issue.code, "\n", issue.message] }, `${issue.code}-${index}`))] })] })) : (workspaceState?.status === "ready") && workspaceState.runtime.status === "unavailable" ? (_jsxs("div", { className: "creator-panel-empty creator-panel-empty--error", children: [_jsx(AlertCircle, { "aria-hidden": "true" }), _jsx("strong", { children: localeMessages.creatorWorkbench.creatorServiceTemporarilyUnavailable }), _jsx("p", { children: creatorRuntimeErrorMessage(workspaceState.runtime.code, workspaceState.runtime.message, localeMessages) }), _jsxs(Button, { size: "sm", variant: "outline", type: "button", disabled: workspaceBusy, onClick: () => void refreshWorkspace(), children: [_jsx(RefreshCw, { "aria-hidden": "true" }), localeMessages.creatorWorkbench.reconnect] }), _jsxs("details", { children: [_jsx("summary", { children: localeMessages.creatorWorkbench.viewTechnicalDetails }), _jsx("code", { children: workspaceState.runtime.code })] })] })) : workspaceState?.status !== "ready" ? (_jsxs("div", { className: "creator-panel-empty", children: [_jsx(FolderOpen, { "aria-hidden": "true" }), _jsx("strong", { children: workspaceState === null ? localeMessages.creatorWorkbench.readingProject : localeMessages.creatorWorkbench.startWithYourFrontendProject }), _jsx("p", { children: localeMessages.creatorWorkbench.chooseAProjectThenDescribeTheAgentUI })] })) : items.filter((item) => item.kind !== "stage" || shouldPresentStage(item, creatorDebug)).length === 0 ? (_jsxs("div", { className: "creator-panel-empty", children: [_jsx(Sparkles, { "aria-hidden": "true" }), _jsx("strong", { children: localeMessages.creatorWorkbench.tellCreatorWhatYouWantToUnderstandInspect }), _jsx("p", { children: localeMessages.creatorWorkbench.analyzeTheCurrentAgentUIDesignAChange })] })) : (presentConversationItems(items, creatorDebug).map((item) => item.kind === "command" ? (_jsxs("article", { className: "creator-panel-message creator-command-activity", role: "status", children: [_jsx("p", { children: item.status === "cancelled" ? localeMessages.commands.preparationCancelled : item.status === "agent-required" ? formatLocaleMessage(localeMessages.commands.addPluginRequested, commandState.optionLabel("enable", item.value ?? "")) : item.status === "integration-required" ? localeMessages.commands.integrationRequired : item.status === "failed" ? localizeCreatorPresentation(item.error, localeMessages) ?? localeMessages.commands.failed : item.commandId === "enable" || item.commandId === "disable" ? formatLocaleMessage(item.status === "running" ? localeMessages.commands.toggling : item.commandId === "enable" ? localeMessages.commands.reenabled : localeMessages.commands.disabledPlugin, item.value ?? "") : item.commandId === "sync" ? (item.status === "running" ? localeMessages.commands.syncing : item.receipt?.verification?.status === "no-project-change" ? localeMessages.commands.alreadySynced : localeMessages.commands.synced) : formatLocaleMessage(item.status === "running" ? localeMessages.commands.running : localeMessages.commands.completed, commandState.optionLabel(item.commandId, item.value ?? "")) }), item.receipt ? _jsx(CreatorRunReceiptPresentation, { receipt: item.receipt, debug: creatorDebug, onUndo: !commandBusy && !isRunning && !questionPending ? runId => { void undoCreatorRun(runId); } : undefined, onReapply: !commandBusy && !isRunning && !questionPending ? runId => { void reapplyCreatorRun(runId); } : undefined, undoBusy: undoRunId === item.receipt.transaction?.runId, reapplyBusy: reapplyRunId === item.receipt.transaction?.runId }) : null] }, item.id)) : item.kind === "stage" ? (_jsx(CreatorStageActivityCard, { activity: item, debug: creatorDebug }, item.id)) : item.kind === "tool-group" ? (_jsx(CreatorToolGroupCard, { activities: item.activities }, item.id)) : item.kind === "question" ? (_jsx(CreatorQuestionCard, { activity: item, onAnswer: answers => { void submit(undefined, { question: item, answers }); }, onAbandon: () => { void abandonQuestion(item); } }, item.id)) : (_jsxs("article", { className: `creator-panel-message creator-panel-message--${item.role}`, children: [_jsxs("div", { className: "creator-message-meta", children: [item.role === "assistant" ? _jsx(Bot, { "aria-hidden": "true" }) : item.role === "user" ? _jsx(UserRound, { "aria-hidden": "true" }) : _jsx(AlertCircle, { "aria-hidden": "true" }), _jsx("span", { children: getRoleLabels(localeMessages)[item.role] })] }), item.role === "assistant" ? (_jsx(CreatorMarkdown, { content: item.content })) : (_jsx("p", { children: item.content })), item.streaming === true ? (_jsx("span", { className: "creator-stream-cursor", "aria-hidden": "true" })) : null, item.receipt === undefined ? null : (_jsx(CreatorRunReceiptPresentation, { receipt: item.receipt, debug: creatorDebug, onUndo: !commandBusy && !isRunning && !hasPendingCreatorQuestion(items) ? (runId) => { void undoCreatorRun(runId); } : undefined, onReapply: !commandBusy && !isRunning && !hasPendingCreatorQuestion(items) ? (runId) => { void reapplyCreatorRun(runId); } : undefined, undoBusy: undoRunId === item.receipt.transaction?.runId, reapplyBusy: reapplyRunId === item.receipt.transaction?.runId }))] }, item.id)))), isRunning ? (_jsx("p", { className: "creator-panel-running", role: "status", children: localeMessages.creatorWorkbench.creatorIsProcessingYourRequest })) : null] })] }), workspaceState?.status === "ready" && !updatePageOpen ? _jsx("div", { className: "creator-panel-footer", children: workspaceState?.status === "ready" ? _jsxs("form", { className: "creator-panel-composer", style: updatePageOpen ? { display: "none" } : undefined, onSubmit: submit, children: [_jsx("label", { htmlFor: "creator-request", children: localeMessages.creatorWorkbench.tellCreator }), commandState.open && !commandBusy && !isRunning && !questionPending ? _jsx(CreatorCommandMenu, { optionDomId: commandState.optionDomId, items: commandState.items, active: commandState.active, title: commandState.title, notice: commandState.notice, onPick: pickCommand, onSelect: commandState.select }, commandState.menuKey) : null, _jsx(Textarea, { role: "combobox", "aria-expanded": commandState.open, "aria-autocomplete": "list", "aria-controls": commandState.open ? "creator-command-menu" : undefined, "aria-activedescendant": commandState.open && commandState.items.length ? commandState.optionDomId(commandState.active) : undefined, disabled: isRunning || commandBusy || questionPending, id: "creator-request", onChange: (event) => setInput(event.target.value), onKeyDown: handleKeyDown, placeholder: localeMessages.creatorWorkbench.forExampleInspectTheUIOrAddA, rows: 2, value: input }), _jsxs("div", { children: [_jsxs("div", { className: "creator-composer-tools", children: [_jsxs(Button, { variant: "ghost", size: "xs", className: "creator-composer-clear", type: "button", disabled: !creatorRuntimeReady || commandBusy || isRunning || questionPending, onClick: clearConversation, title: questionPending ? pendingQuestionHint : isRunning ? localeMessages.creatorWorkbench.stopTheCurrentRunFirst : localeMessages.creatorWorkbench.clearThisConversationAndDraftToStartAgain, children: [_jsx(RotateCcw, { "aria-hidden": "true" }), localeMessages.creatorWorkbench.clearConversation] }), _jsx("small", { children: localeMessages.creatorWorkbench.enterToSendShiftEnterForANew })] }), isRunning ? (_jsxs(Button, { size: "sm", variant: "outline", type: "button", disabled: !runAccepted || stopBusy, onClick: () => void stopCurrentRun(), children: [_jsx(Square, { "aria-hidden": "true" }), stopBusy ? localeMessages.creatorWorkbench.stopping : localeMessages.creatorWorkbench.stopExecution] })) : (_jsxs(Button, { size: "sm", disabled: commandBusy || input.trim() === "" || (commandState.parsed.kind === "text" && !creatorRuntimeReady) || items.some(item => item.kind === "question" && (item.status === "pending" || item.status === "submitting")), type: "submit", children: [_jsx(ArrowUp, { "aria-hidden": "true" }), localeMessages.creatorWorkbench.send] }))] })] }) : null }) : null] })) : (_jsxs(Button, { size: "sm", variant: "outline", "aria-label": localeMessages.creatorWorkbench.openCreatorPanel, className: "creator-panel-open", onClick: () => setIsOpen(true), type: "button", children: [_jsx("span", { "aria-hidden": "true", className: "creator-panel-open-dot" }), _jsx("span", { children: localeMessages.creatorWorkbench.openCreator }), _jsx("span", { "aria-hidden": "true", className: "creator-panel-open-chevron" })] }))] }));
}
export { CreatorLocaleProvider, useAgentUILocale } from "./i18n/locale.js";
export function CreatorWorkbench(props) {
    return _jsx(CreatorLocaleProvider, { locale: props.locale, onLocaleChange: props.onLocaleChange, children: _jsx(CreatorWorkbenchContent, { ...props }) });
}
//# sourceMappingURL=CreatorWorkbench.js.map