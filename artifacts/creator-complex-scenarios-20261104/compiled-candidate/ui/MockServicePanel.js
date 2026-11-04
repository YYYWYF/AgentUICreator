import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef as useLocaleMessagesRef } from "react";
import { localizeCreatorPresentation, useAgentUILocale, DEFAULT_CREATOR_MESSAGES, formatLocaleMessage } from "./i18n/locale.js";
import { Fragment, useEffect, useRef, useState } from "react";
import { FlaskConical, Copy, Check, Download, LoaderCircle } from "lucide-react";
import { Badge } from "./components/badge.js";
import { Button } from "./components/button.js";
import { Card } from "./components/card.js";
import { Input } from "./components/input.js";
import { NativeSelect } from "./components/native-select.js";
import { CREATOR_MOCK_API_PATH } from "../mock/types.js";
import { useCreatorRefresh } from "./creatorRefresh.js";
function getDemoTitles(localeMessages = DEFAULT_CREATOR_MESSAGES) {
    return {
        "web-search": localeMessages.mock.searchTheWebWithTools,
        "retrieval-chunks": localeMessages.mock.retrievePassagesWithTools,
        "source-citations": localeMessages.mock.showSourceCitationsInAnswers,
        "composer-mention-context": localeMessages.mock.askAgentWithContext,
        "multimodal-input": localeMessages.mock.sendTextImagesAndFiles,
        "file-output": localeMessages.mock.generateDownloadableFilesWithTools,
        "frontend-tool-fill-form": localeMessages.mock.fillAFormWithFrontendTools,
        "frontend-tool-open-dialog": localeMessages.mock.openADialogWithFrontendTools,
        "ask-user-question": localeMessages.mock.askTheUserAQuestionAndContinue,
        "concurrent-conversations": localeMessages.mock.runSeveralConversationsConcurrently,
        "multi-message-response": localeMessages.mock.multipleMessagesInOneResponse,
        "cancel-before-first-output": localeMessages.mock.cancelBeforeTheFirstResponse,
        "agent-plan": localeMessages.mock.showAnExecutionPlanThroughActivityEvents,
        "agent-status": localeMessages.mock.showAgentStatusThroughToolArguments,
        "data-message-chart": localeMessages.mock.showACustomChartInMessages,
        "context-retrieval": localeMessages.mock.showContextRetrievalResults,
        "agent-state-sync": localeMessages.mock.updateTaskProgressThroughAgentState,
        "approval-resume": localeMessages.mock.toolCallAwaitingHumanApproval,
        "multi-tool": localeMessages.mock.callToolsSequentially,
        "nested-subagent-conversation": localeMessages.mock.subagentTaskCards,
        "nested-subagent-error": localeMessages.mock.subagentRunError,
        "nested-subagent-recursive": localeMessages.mock.recursiveSubagentDelegation,
        "nested-subagent-task-group": localeMessages.mock.groupMultipleSubagents,
        "parallel-tools": localeMessages.mock.callToolsInParallel,
        "tool-timeline-thinking": localeMessages.mock.toolTimelineThinking,
        "thinking-placeholder": localeMessages.mock.thinkingPlaceholder,
        "reasoning-chat": localeMessages.mock.reasonBeforeResponding,
        "reasoning-long-preview": localeMessages.mock.previewLongReasoning,
        "reasoning-tool-success": localeMessages.mock.reasonCallToolsAndRespond,
        "simple-chat": localeMessages.mock.streamPlainText,
        "markdown-showcase": localeMessages.mock.streamMarkdown,
        "subagent-lifecycle": localeMessages.mock.subagentRunLifecycle,
        "tool-error": localeMessages.mock.errorDuringToolExecution,
        "tool-long-running": localeMessages.mock.longRunningToolsAndWaiting,
    };
}
// Curated teaching focus, not an inventory of every event emitted by a demo.
// Capability labels cover examples whose focus has no dedicated AG-UI event.
function getDemoFocusTags(localeMessages = DEFAULT_CREATOR_MESSAGES) {
    return {
        "simple-chat": ["TEXT_MESSAGE_*"],
        "multi-message-response": ["TEXT_MESSAGE_*", localeMessages.mock.multipleMessages],
        "markdown-showcase": ["TEXT_MESSAGE_*", "Markdown"],
        "multimodal-input": [localeMessages.mock.multimodalInput, localeMessages.mock.attachments],
        "reasoning-chat": ["REASONING_*"],
        "reasoning-long-preview": ["REASONING_*"],
        "reasoning-tool-success": ["REASONING_*", "TOOL_CALL_*"],
        "multi-tool": ["TOOL_CALL_*", localeMessages.mock.sequentialCalls],
        "parallel-tools": ["TOOL_CALL_*", localeMessages.mock.parallelCalls],
        "tool-long-running": ["TOOL_CALL_*", localeMessages.mock.longRunningTool],
        "tool-error": ["TOOL_CALL_*", "RUN_ERROR"],
        "file-output": ["TOOL_CALL_RESULT", localeMessages.mock.fileOutput],
        "frontend-tool-open-dialog": ["TOOL_CALL_*", localeMessages.mock.frontendTools],
        "frontend-tool-fill-form": ["TOOL_CALL_*", "RUN_FINISHED · success", "ToolMessage"],
        "ask-user-question": ["TOOL_CALL_*", "RUN_FINISHED · success", "ToolMessage"],
        "approval-resume": ["RUN_FINISHED · interrupt", "TOOL_CALL_RESULT", localeMessages.mock.approvalRecovery],
        "agent-state-sync": ["STATE_SNAPSHOT", "STATE_DELTA"],
        "agent-plan": ["ACTIVITY_SNAPSHOT", "ACTIVITY_DELTA"],
        "agent-status": ["TOOL_CALL_ARGS", localeMessages.mock.agentState],
        "data-message-chart": ["CUSTOM · chart"],
        "context-retrieval": ["CUSTOM · CONTEXT_*"],
        "nested-subagent-conversation": ["SUBAGENT_STARTED", "SUBAGENT_FINISHED"],
        "nested-subagent-task-group": ["SUBAGENT_STARTED", "SUBAGENT_FINISHED", localeMessages.mock.taskGroup],
        "nested-subagent-recursive": ["SUBAGENT_STARTED", "SUBAGENT_FINISHED", localeMessages.mock.recursiveDelegation],
        "nested-subagent-error": ["SUBAGENT_STARTED", "SUBAGENT_ERROR"],
        "subagent-lifecycle": ["SUBAGENT_STARTED", "SUBAGENT_FINISHED", "SUBAGENT_ERROR"],
        "concurrent-conversations": [localeMessages.mock.concurrentConversations],
        "cancel-before-first-output": [localeMessages.mock.cancelRun],
        "composer-mention-context": ["AG-UI Context"],
        "retrieval-chunks": ["TOOL_CALL_RESULT", localeMessages.mock.retrievedPassages],
        "source-citations": ["TOOL_CALL_RESULT", localeMessages.mock.sourceCitations],
        "web-search": ["TOOL_CALL_RESULT", localeMessages.mock.webSearch],
    };
}
function getDemoGroups(localeMessages = DEFAULT_CREATOR_MESSAGES) {
    return [
        { title: localeMessages.mock.messagesAndContext, ids: ["simple-chat", "multi-message-response", "markdown-showcase", "multimodal-input", "composer-mention-context"] },
        { title: localeMessages.mock.reasoningAndTools, ids: ["tool-timeline-thinking", "thinking-placeholder", "reasoning-chat", "reasoning-tool-success", "parallel-tools", "tool-error", "frontend-tool-open-dialog", "web-search", "retrieval-chunks"] },
        { title: localeMessages.mock.questionsAndApprovals, ids: ["ask-user-question", "frontend-tool-fill-form", "approval-resume"] },
        { title: localeMessages.mock.stateAndExecutionPlans, ids: ["agent-state-sync", "agent-plan", "agent-status"] },
        { title: localeMessages.mock.structuredResultsAndInteractiveUI, ids: ["file-output", "source-citations", "data-message-chart", "context-retrieval"] },
        { title: localeMessages.mock.subagentCollaboration, ids: ["nested-subagent-conversation", "nested-subagent-task-group", "nested-subagent-recursive", "nested-subagent-error"] },
        { title: localeMessages.mock.runOperatorAndRecovery, ids: ["concurrent-conversations", "cancel-before-first-output"] },
    ];
}
function getDemoGroupIndex(localeMessages = DEFAULT_CREATOR_MESSAGES) { return new Map(getDemoGroups(localeMessages).flatMap((group, index) => group.ids.map(id => [id, index]))); }
function getDemoOrderIndex(localeMessages = DEFAULT_CREATOR_MESSAGES) { return new Map(getDemoGroups(localeMessages).flatMap(group => group.ids.map((id, index) => [id, index]))); }
const groupIndexFor = (id, localeMessages = DEFAULT_CREATOR_MESSAGES) => getDemoGroupIndex(localeMessages).get(id) ?? getDemoGroups(localeMessages).length;
const groupTitleFor = (id, localeMessages = DEFAULT_CREATOR_MESSAGES) => getDemoGroups(localeMessages)[groupIndexFor(id, localeMessages)]?.title ?? localeMessages.mock.otherDemos;
async function mockRequest(route = "", body, signal, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    const response = await fetch(`${CREATOR_MOCK_API_PATH}${route}`, {
        ...(body === undefined ? {} : {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }),
        ...(signal === undefined ? {} : { signal }),
    });
    if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error(localeMessages.mock.creatorDoesNotProvideTheMockControlAPI);
    }
    const value = await response.json();
    if (!response.ok)
        throw new Error(value.error ?? formatLocaleMessage(localeMessages.mock.mockRequestFailed, response.status));
    return value;
}
export function MockServicePanel({ projectId, projectPath } = {}) {
    const localeMessages = useAgentUILocale();
    const localeMessagesRef = useLocaleMessagesRef(localeMessages);
    localeMessagesRef.current = localeMessages;
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState(false);
    const [selecting, setSelecting] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState("");
    const [copiedEndpoint, setCopiedEndpoint] = useState(null);
    const [query, setQuery] = useState("");
    const [retry, setRetry] = useState(0);
    const version = useRef(0);
    const inFlight = useRef(false);
    const [compatibility, setCompatibility] = useState(null);
    const compatibilityVersion = useRef(0);
    const [installation, setInstallation] = useState(null);
    useCreatorRefresh(data => {
        if (inFlight.current || (projectId !== undefined && data.projectId !== projectId))
            return;
        if (data.mock?.projectId === data.projectId) {
            version.current += 1;
            setState(data.mock);
            setError(null);
        }
        if (data.compatibility?.projectId === data.projectId) {
            compatibilityVersion.current += 1;
            setCompatibility(data.compatibility);
        }
    });
    async function installRequirements(scenarioId) {
        if (inFlight.current)
            return;
        inFlight.current = true;
        const current = ++compatibilityVersion.current;
        setBusy(true);
        setError(null);
        setNotice("");
        let latest = compatibility;
        let resourceId = "";
        let projectedError = localeMessages.mock.resourceInstallationFailedRetry;
        setInstallation({ scenarioId, resourceId, status: "installing", message: localeMessages.mock.checkingDemoSupportInTheCurrentProject });
        try {
            if (latest?.status !== "checked") {
                projectedError = localeMessages.mock.resourceInstallationFailedRetry;
                const response = await fetch(`${CREATOR_MOCK_API_PATH}/compatibility`);
                const result = await response.json();
                if (current !== compatibilityVersion.current)
                    return;
                if (result.issue?.code === "CREATOR_OPERATOR_RESTART_REQUIRED")
                    projectedError = localeMessages.mock.operatorRestartRequired;
                if (!response.ok || result.status !== "checked" || !result.projectId ||
                    (projectId !== undefined && result.projectId !== projectId))
                    throw new Error(projectedError);
                latest = result;
                setCompatibility(latest);
            }
            if (!latest.projectId)
                throw new Error(projectedError);
            const installationProjectId = latest.projectId;
            const requirements = latest.requirements.filter(item => item.scenarioIds.includes(scenarioId) && item.status !== "ready");
            if (requirements.some(item => !item.installable)) {
                projectedError = requirements.some(item => item.status === "conflict")
                    ? formatLocaleMessage(localeMessages.mock.resourcesConflictWithTheCurrentProject, requirements.find(item => item.status === "conflict").name)
                    : localeMessages.mock.thisCreatorHostDoesNotSupportOneClick;
                throw new Error(projectedError);
            }
            for (const requirement of requirements) {
                if (current !== compatibilityVersion.current)
                    return;
                if (latest.requirements.some(item => item.id === requirement.id && item.status === "ready"))
                    continue;
                resourceId = requirement.id;
                projectedError = formatLocaleMessage(localeMessages.mock.couldNotInstallResourcesRetry, requirement.name);
                setInstallation({ scenarioId, resourceId, status: "installing", message: formatLocaleMessage(localeMessages.mock.installingResources, requirement.name) });
                const response = await fetch(`${CREATOR_MOCK_API_PATH}/install-resources`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ projectId: installationProjectId, resourceId }),
                });
                const result = await response.json();
                if (current !== compatibilityVersion.current)
                    return;
                if (!response.ok) {
                    if (result.code === "RESOURCE_CONFLICT") {
                        projectedError = formatLocaleMessage(localeMessages.mock.resourcesConflictWithTheCurrentProject, requirement.name);
                        setCompatibility(previous => previous === null ? null : ({ ...previous, requirements: previous.requirements.map(item => item.id === resourceId ? { ...item, status: "conflict", installable: false, issue: { code: "RESOURCE_CONFLICT", message: projectedError } } : item) }));
                    }
                    throw new Error(projectedError);
                }
                latest = result;
                setCompatibility(latest);
                if (latest.status !== "checked" || latest.projectId !== installationProjectId ||
                    !latest.requirements.some(item => item.id === resourceId && item.status === "ready"))
                    throw new Error(projectedError);
            }
            if (latest.requirements.some(item => item.scenarioIds.includes(scenarioId) && item.status !== "ready"))
                throw new Error(projectedError);
            setInstallation({ scenarioId, resourceId, status: "success", message: localeMessages.mock.resourcesInstalledAndReadyYouCanRunThe });
        }
        catch {
            if (current === compatibilityVersion.current)
                setInstallation({ scenarioId, resourceId, status: "error", message: projectedError });
        }
        finally {
            inFlight.current = false;
            setBusy(false);
        }
    }
    useEffect(() => {
        const controller = new AbortController();
        compatibilityVersion.current += 1;
        setCompatibility(null);
        setInstallation(null);
        async function refresh() {
            if (inFlight.current)
                return;
            const current = compatibilityVersion.current;
            try {
                const response = await fetch(`${CREATOR_MOCK_API_PATH}/compatibility`, { signal: controller.signal });
                const result = await response.json();
                if (controller.signal.aborted || current !== compatibilityVersion.current)
                    return;
                if (response.ok && (result.status === "checked" || result.status === "unknown") &&
                    (projectId === undefined || result.projectId === projectId))
                    setCompatibility(result);
                else
                    setCompatibility({ projectId: projectId ?? null, status: "unknown", requirements: [] });
            }
            catch {
                if (!controller.signal.aborted && current === compatibilityVersion.current)
                    setCompatibility({ projectId: projectId ?? null, status: "unknown", requirements: [] });
            }
        }
        void refresh();
        return () => { controller.abort(); };
    }, [projectId, retry]);
    function requirementsFor(scenarioId) {
        return compatibility?.status === "checked"
            ? compatibility.requirements.filter(requirement => requirement.scenarioIds.includes(scenarioId) && requirement.status !== "ready")
            : [];
    }
    useEffect(() => { setCopiedEndpoint(null); }, [state?.endpoint]);
    useEffect(() => {
        const controller = new AbortController();
        const refresh = async () => {
            if (inFlight.current)
                return;
            const current = version.current;
            try {
                const next = await mockRequest("", undefined, controller.signal, localeMessagesRef.current);
                if (!controller.signal.aborted && current === version.current) {
                    setState(next);
                    setError(null);
                }
            }
            catch (failure) {
                if (!controller.signal.aborted && current === version.current) {
                    setError(failure instanceof Error ? failure.message : localeMessagesRef.current.mock.couldNotConnectToMockServiceControl);
                }
            }
        };
        void refresh();
        return () => { controller.abort(); };
    }, [projectId, retry]);
    async function act(route, body, message) {
        if (inFlight.current)
            return;
        inFlight.current = true;
        version.current += 1;
        setSelecting(route === "/select");
        setBusy(true);
        setError(null);
        setNotice("");
        try {
            const next = await mockRequest(route, body, undefined, localeMessages);
            setState(next);
            if (route === "/start" && next.endpoint !== null) {
                // Verify the advertised independent URL from the browser, including CORS.
                const check = await fetch(`${next.endpoint}/scenarios`);
                if (!check.ok)
                    throw new Error(formatLocaleMessage(localeMessages.mock.mockServiceStartedButConnectionCheckFailed, check.status));
            }
            setNotice(message);
        }
        catch (failure) {
            setError(failure instanceof Error ? failure.message : localeMessages.mock.mockOperationFailed);
        }
        finally {
            inFlight.current = false;
            setBusy(false);
            setSelecting(false);
        }
    }
    function selectScenario(scenario) {
        if (busy || !state)
            return;
        // The service checks readiness using its project-scoped cache. A stale or
        // pending panel inspection must never swallow the user's selection.
        void act("/select", { scenarioId: scenario.id, speed: state.speed }, formatLocaleMessage(localeMessages.mock.selectedForTheNextRequest, titleFor(scenario)));
    }
    async function copyAddress() {
        if (!state?.endpoint)
            return;
        try {
            await navigator.clipboard.writeText(state.endpoint);
            setCopiedEndpoint(state.endpoint);
            setNotice(localeMessages.mock.mockAddressCopied);
        }
        catch {
            setError(localeMessages.mock.couldNotCopyAutomaticallySelectTheAddressAnd);
        }
    }
    const localSelected = state?.selection?.type === "recording";
    const selectedRecording = localSelected ? state?.recordings?.find(item => item.id === state.selection.id) : undefined;
    const availableScenarios = state?.scenarios.filter(scenario => !scenario.id.startsWith("a2ui-") && !scenario.capabilities?.includes("a2ui")) ?? [];
    const selected = availableScenarios.find((scenario) => scenario.id === state?.scenarioId);
    const descriptions = localeMessages.mockDescriptions;
    const descriptionFor = (scenario) => descriptions[scenario.id] ?? scenario.description;
    const titleFor = (scenario) => getDemoTitles(localeMessages)[scenario.id] ?? scenario.title;
    const search = query.trim().toLocaleLowerCase();
    const scenarios = availableScenarios.filter((scenario) => `${scenario.id} ${titleFor(scenario)} ${scenario.title} ${descriptionFor(scenario) ?? ""} ${(getDemoFocusTags(localeMessages)[scenario.id] ?? []).join(" ")}`.toLocaleLowerCase().includes(search)).sort((first, second) => groupIndexFor(first.id, localeMessages) - groupIndexFor(second.id, localeMessages)
        || (getDemoOrderIndex(localeMessages).get(first.id) ?? 0) - (getDemoOrderIndex(localeMessages).get(second.id) ?? 0)) ?? [];
    return (_jsxs("section", { className: "creator-mock-panel creator-ui-scope", id: "creator-mock-panel", "aria-label": localeMessages.mock.mockAgentDevelopmentService, "aria-busy": busy, children: [_jsxs("header", { children: [_jsxs("div", { className: "creator-mock-heading", children: [_jsx(FlaskConical, { "aria-hidden": "true" }), _jsx("h2", { children: localeMessages.mock.mockAgent })] }), _jsx("p", { children: localeMessages.mock.replayLocalMockRecordingsOrBuiltInDemos })] }), error === null ? null : _jsxs("div", { className: "creator-mock-error", role: "alert", children: [localizeCreatorPresentation(error, localeMessages), _jsx(Button, { size: "sm", variant: "outline", type: "button", disabled: busy, onClick: () => setRetry((value) => value + 1), children: localeMessages.mock.retryConnection })] }), state === null ? _jsx("p", { role: "status", children: localeMessages.mock.readingMockServiceState }) : _jsxs(_Fragment, { children: [_jsxs(Card, { className: "creator-mock-service", role: "region", "aria-label": localeMessages.mock.serviceControls, children: [_jsxs("div", { className: "creator-mock-service-actions", children: [_jsx(Badge, { variant: "secondary", className: "creator-mock-status", "data-running": state.status === "running", children: state.status === "running" ? localeMessages.mock.running : localeMessages.mock.stopped }), _jsx(Button, { size: "sm", variant: state.status === "running" ? "outline" : "default", type: "button", disabled: busy, onClick: () => void act(state.status === "running" ? "/stop" : "/start", {}, state.status === "running" ? localeMessages.mock.mockServiceStopped : localeMessages.mock.mockServiceStartedCreatorPreviewUsesTheSelected), children: busy ? localeMessages.mock.processing : state.status === "running" ? localeMessages.mock.stopService : localeMessages.mock.startService })] }), state.endpoint === null ? _jsx("p", { children: localeMessages.mock.aLocalAddressAppearsAfterStartingAnAvailable }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: "creator-mock-address-row", children: [_jsxs("label", { className: "creator-mock-address", children: [localeMessages.mock.aGUIAddress, _jsx(Input, { readOnly: true, value: state.endpoint, onFocus: (event) => event.target.select() })] }), _jsxs(Button, { size: "sm", variant: "outline", type: "button", className: "creator-mock-copy", "data-copied": copiedEndpoint === state.endpoint, onClick: () => void copyAddress(), children: [copiedEndpoint === state.endpoint ? _jsx(Check, { "aria-hidden": "true" }) : _jsx(Copy, { "aria-hidden": "true" }), copiedEndpoint === state.endpoint ? localeMessages.mock.copied : localeMessages.mock.copyAddress] })] }), _jsx("p", { children: localeMessages.mock.previewConnectionManagedByCreator })] }), _jsx("p", { children: localeMessages.mock.theServiceKeepsRunningAfterClosingThePanel })] }), _jsx("p", { className: "creator-mock-notice", role: "status", children: localizeCreatorPresentation(notice, localeMessages) }), _jsxs("section", { "aria-label": localeMessages.mock.chooseMockSource, children: [_jsx("h3", { children: localeMessages.mock.mockSource }), selecting ? _jsxs("p", { role: "status", children: [_jsx(LoaderCircle, { className: "cui:size-4 cui:animate-spin", "aria-hidden": "true" }), localeMessages.mock.switchingMockSource] }) : null, _jsxs("p", { className: "creator-mock-current-demo", children: [localeMessages.mock.current, _jsx("strong", { children: localSelected ? (selectedRecording?.title ?? state.selection.id) : (selected ? titleFor(selected) : state.scenarioId) })] }), _jsxs("p", { children: [localeMessages.mock.source, localSelected ? localeMessages.mock.localRecording : localeMessages.mock.builtInDemo] }), _jsxs("details", { className: "creator-mock-demo-help", children: [_jsx("summary", { children: localeMessages.mock.demoInstructions }), _jsx("p", { children: localeMessages.mock.afterSelectingSendAMessageInTheConnected }), _jsx("p", { children: localeMessages.mock.someDemosRequireExtraAgentUIResourcesCreator })] }), compatibility === null || compatibility.issue?.code === "CREATOR_OPERATOR_RESTART_REQUIRED" ? _jsx("p", { className: "creator-mock-requirement", role: "status", children: compatibility === null ? localeMessages.mock.checkingDemoSupportInTheCurrentProject : localeMessages.mock.operatorRestartRequired }) : null, _jsxs("label", { className: "creator-mock-speed", children: [localeMessages.mock.replayDurationMultiplier, _jsxs(NativeSelect, { disabled: busy, value: state.speed, onChange: (event) => void act("/select", { selection: state.selection ?? { type: "builtin", id: state.scenarioId }, projectId: state.projectId, speed: Number(event.target.value) }, localeMessages.mock.replayDurationUpdatedForTheNextRequest), children: [_jsx("option", { value: 0, children: localeMessages.mock.completeImmediately }), _jsx("option", { value: 0.1, children: localeMessages.mock.fastTest01 }), _jsx("option", { value: 0.5, children: localeMessages.mock.faster05 }), _jsx("option", { value: 1, children: localeMessages.mock.normal1 }), _jsx("option", { value: 2, children: localeMessages.mock.slower2 })] })] }), _jsxs("label", { className: "creator-mock-search", children: [localeMessages.mock.searchMocks, _jsx(Input, { value: query, onChange: (event) => setQuery(event.target.value), placeholder: localeMessages.mock.nameEventCapabilityOrScenarioID })] }), _jsxs("section", { className: "creator-mock-local-recordings", "aria-label": localeMessages.mock.localMock, children: [_jsx("h3", { children: localeMessages.mock.localMock }), _jsxs("p", { children: [localeMessages.mock.placeRecordingFilesInThisDirectoryInYour, " ", _jsx("code", { children: ".agent-ui/mocks" }), localeMessages.mock.thenSelectARecordingAndSendAMessage] }), projectPath ? _jsxs("details", { className: "creator-mock-file-location", children: [_jsx("summary", { children: localeMessages.mock.viewRecordingDirectory }), _jsxs("code", { children: [projectPath.replace(/[\\/]$/, ""), "/.agent-ui/mocks"] })] }) : null, state.recordingsError ? _jsxs("p", { role: "alert", children: [localeMessages.mock.couldNotReadLocalMock, state.recordingsError] }) : null, _jsx("div", { className: "creator-mock-scenarios", children: (state.recordings ?? []).filter(item => `${item.title} ${item.fileName} ${item.id}`.toLocaleLowerCase().includes(search)).map(recording => _jsx("div", { className: "creator-mock-scenario", "data-selected": localSelected && state.selection.id === recording.id, children: _jsxs("label", { className: "creator-mock-scenario-choice", children: [_jsx("input", { type: "radio", name: "creator-mock-scenario", checked: localSelected && state.selection.id === recording.id, disabled: busy || recording.status !== "ready", onChange: () => { void act("/select", { selection: { type: "recording", id: recording.id }, projectId: state.projectId, speed: state.speed }, formatLocaleMessage(localeMessages.mock.selectedForTheNextRequest, recording.title)); } }), _jsxs("span", { children: [_jsx("strong", { children: recording.title }), _jsx("span", { children: recording.status === "ready" ? formatLocaleMessage(localeMessages.mock.eventsS, recording.eventCount, (recording.durationMs / 1000).toFixed(1)) : formatLocaleMessage(localeMessages.mock.couldNotRead, recording.error ?? localeMessages.mock.invalidFile) })] })] }) }, recording.id)) }), !(state.recordings ?? []).length && !state.recordingsError ? _jsx("p", { children: localeMessages.mock.noLocalMockFilesInThisProjectYet }) : null] }), _jsx("h3", { children: localeMessages.mock.builtInDemo }), _jsx("p", { children: localeMessages.mock.tagsIdentifyEachDemoSEventsAndCapabilities }), _jsx("div", { className: "creator-mock-scenarios", children: scenarios.map((scenario, index) => _jsxs(Fragment, { children: [index === 0 || groupIndexFor(scenario.id, localeMessages) !== groupIndexFor(scenarios[index - 1].id, localeMessages)
                                            ? _jsx("h4", { className: "creator-mock-group-heading", children: groupTitleFor(scenario.id, localeMessages) }) : null, _jsxs("div", { className: "creator-mock-scenario", "data-selected": !localSelected && scenario.id === state?.scenarioId, onClick: event => {
                                                if (event.target.closest("label, input, button, details, a"))
                                                    return;
                                                selectScenario(scenario);
                                            }, children: [_jsxs("label", { className: "creator-mock-scenario-choice", children: [_jsx("input", { type: "radio", name: "creator-mock-scenario", checked: !localSelected && scenario.id === state?.scenarioId, disabled: busy, onChange: () => { }, onClick: () => selectScenario(scenario) }), _jsxs("span", { children: [_jsx("strong", { children: titleFor(scenario) }), descriptionFor(scenario) ? _jsx("span", { children: descriptionFor(scenario) }) : null] })] }), getDemoFocusTags(localeMessages)[scenario.id]?.length ? _jsx("div", { className: "creator-mock-focus-tags", role: "group", "aria-label": localeMessages.mock.featuredEventsAndCapabilities, children: getDemoFocusTags(localeMessages)[scenario.id].map(tag => _jsx(Badge, { variant: "secondary", "data-event-tag": /^(TEXT_MESSAGE_|REASONING_|TOOL_CALL_|RUN_|STATE_|ACTIVITY_|SUBAGENT_|CUSTOM\b)/.test(tag), children: tag }, tag)) }) : null, scenario.resources?.length && ((compatibility?.status === "checked" && requirementsFor(scenario.id).length > 0) || (busy && installation?.scenarioId === scenario.id && installation.status === "installing")) ? _jsxs("div", { className: "creator-mock-scenario-footer", children: [_jsx("div", { className: "creator-mock-resource-actions", children: scenario.resources.includes("ask-user-question") ? _jsx("p", { children: localeMessages.mock.enableQuestionPluginInCreator }) : _jsxs(Button, { size: "sm", variant: "outline", type: "button", className: "creator-mock-install-icon", "aria-label": busy && installation?.scenarioId === scenario.id ? localeMessages.mock.processing : localeMessages.mock.downloadResources, title: busy && installation?.scenarioId === scenario.id ? localeMessages.mock.processing : localeMessages.mock.downloadResources, "aria-busy": busy && installation?.scenarioId === scenario.id, disabled: busy || requirementsFor(scenario.id).some(item => !item.installable), onClick: () => void installRequirements(scenario.id), children: [busy && installation?.scenarioId === scenario.id
                                                                        ? _jsx(LoaderCircle, { className: "creator-mock-install-spinner", "aria-hidden": "true" })
                                                                        : _jsx(Download, { "aria-hidden": "true" }), _jsx("span", { children: localeMessages.mock.downloadResources })] }) }), compatibility?.projectId ? requirementsFor(scenario.id)
                                                            .filter(requirement => requirement.status === "conflict" || (installation?.resourceId === requirement.id && installation.status === "error"))
                                                            .map(requirement => _jsx(MockResourceDiagnostics, { projectId: compatibility.projectId, resourceId: requirement.id }, `${compatibility.projectId}:${requirement.id}:${installation?.status}`)) : null] }) : null, installation?.scenarioId === scenario.id ? _jsx("div", { className: "creator-mock-install-status", "data-status": installation.status, role: installation.status === "error" ? "alert" : "status", children: localizeCreatorPresentation(installation.message, localeMessages) }) : null, requirementsFor(scenario.id).some(requirement => !requirement.installable && requirement.status !== "conflict") ? _jsx("div", { className: "creator-mock-install-status", children: localeMessages.mock.thisCreatorHostDoesNotSupportOneClick }) : null] })] }, scenario.id)) }), scenarios.length === 0 ? _jsx("p", { children: localeMessages.mock.noMatchingDemos }) : null] })] })] }));
}
/** Fetch implementation data only after the developer explicitly opens diagnostics. */
function MockResourceDiagnostics({ projectId, resourceId }) {
    const localeMessages = useAgentUILocale();
    const [details, setDetails] = useState(null);
    const loading = useRef(false);
    const controller = useRef(null);
    useEffect(() => () => controller.current?.abort(), []);
    async function load(open) {
        if (!open || loading.current || details !== null)
            return;
        loading.current = true;
        controller.current = new AbortController();
        try {
            const response = await fetch(`${CREATOR_MOCK_API_PATH}/resource-diagnostics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, resourceId }), signal: controller.current.signal });
            const result = await response.json();
            if (!response.ok)
                throw new Error(localeMessages.mock.couldNotReadTechnicalDetailsRefreshAndRetry);
            if (!controller.current.signal.aborted)
                setDetails(JSON.stringify(result, null, 2));
        }
        catch {
            if (!controller.current?.signal.aborted)
                setDetails(localeMessages.mock.couldNotReadTechnicalDetailsRefreshAndRetry);
        }
        finally {
            loading.current = false;
        }
    }
    return _jsxs("details", { className: "creator-mock-resource-diagnostics", onToggle: event => void load(event.currentTarget.open), children: [_jsx("summary", { children: localeMessages.mock.viewTechnicalDetails }), _jsx("pre", { children: details ?? localeMessages.mock.readingTechnicalDetails })] });
}
//# sourceMappingURL=MockServicePanel.js.map