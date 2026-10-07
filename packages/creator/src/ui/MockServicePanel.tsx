import { useRef as useLocaleMessagesRef } from "react";
import { localizeCreatorPresentation, useAgentUILocale, DEFAULT_CREATOR_MESSAGES, type CreatorLocaleMessages, formatLocaleMessage } from "./i18n/locale.js";
import { Fragment, useEffect, useRef, useState } from "react";
import { FlaskConical, Copy, Check } from "lucide-react";
import { Badge } from "./components/badge.js";
import { Button } from "./components/button.js";
import { Card } from "./components/card.js";
import { Input } from "./components/input.js";
import { NativeSelect } from "./components/native-select.js";
import { CREATOR_MOCK_API_PATH, type CreatorMockState } from "../mock/types.js";
import type { MockDemoCompatibility } from "../mock/demo-compatibility.js";
import { useCreatorRefresh } from "./creatorRefresh.js";

function getDemoTitles(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Record<string, string> { return {
  "web-search": localeMessages.mock.searchTheWebWithTools,
  "retrieval-chunks": localeMessages.mock.retrievePassagesWithTools,
  "source-citations": localeMessages.mock.showSourceCitationsInAnswers,
  "resumable-long-run": localeMessages.mock.continueALongResponseAfterRefreshing,
  "resumable-agent-plan": localeMessages.mock.recoverExecutionPlanProgressAfterRefreshing,
  "composer-mention-context": localeMessages.mock.askAgentWithContext,
  "multimodal-input": localeMessages.mock.sendTextImagesAndFiles,
  "file-output": localeMessages.mock.generateDownloadableFilesWithTools,
  "a2ui-form-controls": localeMessages.mock.interactiveA2UIForm,
  "a2ui-interactive-order": localeMessages.mock.a2UIOrderConfirmationCard,
  "frontend-tool-fill-form": localeMessages.mock.fillAFormWithFrontendTools,
  "frontend-tool-open-dialog": localeMessages.mock.openADialogWithFrontendTools,
  "ask-user-question": localeMessages.mock.askTheUserAQuestionAndContinue,
  "concurrent-conversations": localeMessages.mock.runSeveralConversationsConcurrently,
  "multi-message-response": localeMessages.mock.multipleMessagesInOneResponse,
  "cancel-before-first-output": localeMessages.mock.cancelBeforeTheFirstResponse,
  "agent-plan": localeMessages.mock.showAnExecutionPlanThroughActivityEvents,
  "agent-status": localeMessages.mock.showAgentStatusThroughToolArguments,
  "data-message-chart": localeMessages.mock.showACustomChartInMessages,
  "agent-state-sync": localeMessages.mock.updateTaskProgressThroughAgentState,
  "approval-resume": localeMessages.mock.toolCallAwaitingHumanApproval,
  "multi-tool": localeMessages.mock.callToolsSequentially,
  "nested-subagent-conversation": localeMessages.mock.subagentTaskCards,
  "nested-subagent-error": localeMessages.mock.subagentRunError,
  "nested-subagent-recursive": localeMessages.mock.recursiveSubagentDelegation,
  "nested-subagent-task-group": localeMessages.mock.groupMultipleSubagents,
  "parallel-tools": localeMessages.mock.callToolsInParallel,
  "reasoning-chat": localeMessages.mock.reasonBeforeResponding,
  "reasoning-long-preview": localeMessages.mock.previewLongReasoning,
  "reasoning-tool-success": localeMessages.mock.reasonCallToolsAndRespond,
  "simple-chat": localeMessages.mock.streamPlainText,
  "markdown-showcase": localeMessages.mock.streamMarkdown,
  "subagent-lifecycle": localeMessages.mock.subagentRunLifecycle,
  "tool-error": localeMessages.mock.errorDuringToolExecution,
  "tool-long-running": localeMessages.mock.longRunningToolsAndWaiting,
}; }

// Curated teaching focus, not an inventory of every event emitted by a demo.
// Capability labels cover examples whose focus has no dedicated AG-UI event.
function getDemoFocusTags(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Record<string, readonly string[]> { return {
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
  "frontend-tool-fill-form": ["TOOL_CALL_*", localeMessages.mock.frontendTools],
  "ask-user-question": ["TOOL_CALL_*", localeMessages.mock.userQuestion],
  "approval-resume": ["RUN_FINISHED · interrupt", "TOOL_CALL_RESULT", localeMessages.mock.approvalRecovery],
  "agent-state-sync": ["STATE_SNAPSHOT", "STATE_DELTA"],
  "agent-plan": ["ACTIVITY_SNAPSHOT", "ACTIVITY_DELTA"],
  "agent-status": ["TOOL_CALL_ARGS", localeMessages.mock.agentState],
  "data-message-chart": ["CUSTOM · chart"],
  "a2ui-form-controls": ["ACTIVITY_SNAPSHOT", "A2UI"],
  "a2ui-interactive-order": ["ACTIVITY_SNAPSHOT", "A2UI"],
  "nested-subagent-conversation": ["SUBAGENT_STARTED", "SUBAGENT_FINISHED"],
  "nested-subagent-task-group": ["SUBAGENT_STARTED", "SUBAGENT_FINISHED", localeMessages.mock.taskGroup],
  "nested-subagent-recursive": ["SUBAGENT_STARTED", "SUBAGENT_FINISHED", localeMessages.mock.recursiveDelegation],
  "nested-subagent-error": ["SUBAGENT_STARTED", "SUBAGENT_ERROR"],
  "subagent-lifecycle": ["SUBAGENT_STARTED", "SUBAGENT_FINISHED", "SUBAGENT_ERROR"],
  "concurrent-conversations": [localeMessages.mock.concurrentConversations],
  "cancel-before-first-output": [localeMessages.mock.cancelRun],
  "composer-mention-context": ["AG-UI Context"],
  "resumable-long-run": [localeMessages.mock.runRecovery],
  "resumable-agent-plan": ["ACTIVITY_SNAPSHOT", "ACTIVITY_DELTA", localeMessages.mock.runRecovery],
  "retrieval-chunks": ["TOOL_CALL_RESULT", localeMessages.mock.retrievedPassages],
  "source-citations": ["TOOL_CALL_RESULT", localeMessages.mock.sourceCitations],
  "web-search": ["TOOL_CALL_RESULT", localeMessages.mock.webSearch],
}; }

function getDemoGroups(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) { return [
  { title: localeMessages.mock.messagesAndContext, ids: ["simple-chat", "multi-message-response", "markdown-showcase", "multimodal-input", "composer-mention-context"] },
  { title: localeMessages.mock.reasoningAndTools, ids: ["reasoning-chat", "reasoning-tool-success", "parallel-tools", "tool-error", "frontend-tool-open-dialog", "frontend-tool-fill-form", "web-search", "retrieval-chunks"] },
  { title: localeMessages.mock.questionsAndApprovals, ids: ["ask-user-question", "approval-resume"] },
  { title: localeMessages.mock.stateAndExecutionPlans, ids: ["agent-state-sync", "agent-plan", "agent-status"] },
  { title: localeMessages.mock.structuredResultsAndInteractiveUI, ids: ["file-output", "source-citations", "data-message-chart", "a2ui-form-controls", "a2ui-interactive-order"] },
  { title: localeMessages.mock.subagentCollaboration, ids: ["nested-subagent-conversation", "nested-subagent-task-group", "nested-subagent-recursive", "nested-subagent-error"] },
  { title: localeMessages.mock.runControlAndRecovery, ids: ["concurrent-conversations", "cancel-before-first-output", "resumable-long-run", "resumable-agent-plan"] },
] as const; }
function getDemoGroupIndex(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) { return new Map<string, number>(getDemoGroups(localeMessages).flatMap((group, index) => group.ids.map(id => [id, index] as const))); }
function getDemoOrderIndex(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) { return new Map<string, number>(getDemoGroups(localeMessages).flatMap(group => group.ids.map((id, index) => [id, index] as const))); }
const groupIndexFor = (id: string, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) => getDemoGroupIndex(localeMessages).get(id) ?? getDemoGroups(localeMessages).length;
const groupTitleFor = (id: string, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) => getDemoGroups(localeMessages)[groupIndexFor(id, localeMessages)]?.title ?? localeMessages.mock.otherDemos;

async function mockRequest(route = "", body?: unknown, signal?: AbortSignal, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Promise<CreatorMockState> {
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
  if (!response.ok) throw new Error(value.error ?? formatLocaleMessage(localeMessages.mock.mockRequestFailed, response.status));
  return value as CreatorMockState;
}

export function MockServicePanel({ projectId, projectPath }: { projectId?: string; projectPath?: string } = {}) {
  const localeMessages = useAgentUILocale();
  const localeMessagesRef = useLocaleMessagesRef(localeMessages);
  localeMessagesRef.current = localeMessages;
  const [state, setState] = useState<CreatorMockState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const version = useRef(0);
  const inFlight = useRef(false);
  const [compatibility, setCompatibility] = useState<MockDemoCompatibility | null>(null);
  const compatibilityVersion = useRef(0);
  const [installation, setInstallation] = useState<{ scenarioId: string; resourceId: string; status: "installing" | "success" | "error"; message: string } | null>(null);

  const [resourceSelection, setResourceSelection] = useState<string | null>(null);
  useCreatorRefresh(data => {
    if (inFlight.current || (projectId !== undefined && data.projectId !== projectId)) return;
    if (data.mock?.projectId === data.projectId) {
      version.current += 1;
      setState(data.mock); setError(null);
    }
    if (data.compatibility?.projectId === data.projectId) {
      compatibilityVersion.current += 1;
      setCompatibility(data.compatibility);
    }
  });

  async function installRequirements(scenarioId: string) {
    if (inFlight.current || !compatibility?.projectId) return;
    const requirements = requirementsFor(scenarioId);
    if (!requirements.length || requirements.some(item => !item.installable)) return;
    inFlight.current = true;
    const current = ++compatibilityVersion.current;
    setBusy(true); setError(null); setNotice("");
    let latest = compatibility;
    let resourceId = requirements[0]!.id;
    let projectedError = localeMessages.mock.resourceInstallationFailedRetry;
    try {
      for (const requirement of requirements) {
        if (current !== compatibilityVersion.current) return;
        if (latest.requirements.some(item => item.id === requirement.id && item.status === "ready")) continue;
        resourceId = requirement.id;
        projectedError = formatLocaleMessage(localeMessages.mock.couldNotInstallResourcesRetry, requirement.name);
        setInstallation({ scenarioId, resourceId, status: "installing", message: formatLocaleMessage(localeMessages.mock.installingResources, requirement.name) });
        const response = await fetch(`${CREATOR_MOCK_API_PATH}/install-resources`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: compatibility.projectId, resourceId }),
        });
        const result = await response.json();
        if (current !== compatibilityVersion.current) return;
        if (!response.ok) {
          if (result.code === "RESOURCE_CONFLICT") {
            projectedError = formatLocaleMessage(localeMessages.mock.resourcesConflictWithTheCurrentProject, requirement.name);
            setCompatibility(previous => previous === null ? null : ({ ...previous, requirements: previous.requirements.map(item => item.id === resourceId ? { ...item, status: "conflict", installable: false, issue: { code: "RESOURCE_CONFLICT", message: projectedError } } : item) }));
          }
          throw new Error(projectedError);
        }
        latest = result as MockDemoCompatibility;
        setCompatibility(latest);
        if (latest.status !== "checked" || latest.projectId !== compatibility.projectId ||
            !latest.requirements.some(item => item.id === resourceId && item.status === "ready")) throw new Error(projectedError);
      }
      if (latest.requirements.some(item => item.scenarioIds.includes(scenarioId) && item.status !== "ready")) throw new Error(projectedError);
      setInstallation({ scenarioId, resourceId, status: "success", message: localeMessages.mock.resourcesInstalledAndReadyYouCanRunThe });
    } catch {
      if (current === compatibilityVersion.current) setInstallation({ scenarioId, resourceId, status: "error", message: projectedError });
    } finally { inFlight.current = false; setBusy(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    compatibilityVersion.current += 1;
    setCompatibility(null);
    setInstallation(null);
    setResourceSelection(null);
    async function refresh() {
      if (inFlight.current) return;
      const current = compatibilityVersion.current;
      try {
        const response = await fetch(`${CREATOR_MOCK_API_PATH}/compatibility`, { signal: controller.signal });
        const result = await response.json() as MockDemoCompatibility;
        if (controller.signal.aborted || current !== compatibilityVersion.current) return;
        if (response.ok && (result.status === "checked" || result.status === "unknown") &&
            (projectId === undefined || result.projectId === projectId)) setCompatibility(result);
        else setCompatibility({ projectId: projectId ?? null, status: "unknown", requirements: [] });
      } catch {
        if (!controller.signal.aborted && current === compatibilityVersion.current) setCompatibility({ projectId: projectId ?? null, status: "unknown", requirements: [] });
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 4000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [projectId, retry]);

  function requirementsFor(scenarioId: string) {
    return compatibility?.status === "checked"
      ? compatibility.requirements.filter(requirement => requirement.scenarioIds.includes(scenarioId) && requirement.status !== "ready")
      : [];
  }

  useEffect(() => { setCopiedEndpoint(null); }, [state?.endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (inFlight.current) return;
      const current = version.current;
      try {
        const next = await mockRequest("", undefined, controller.signal, localeMessagesRef.current);
        if (!controller.signal.aborted && current === version.current) {
          setState(next); setError(null);
        }
      } catch (failure) {
        if (!controller.signal.aborted && current === version.current) {
          setError(failure instanceof Error ? failure.message : localeMessagesRef.current.mock.couldNotConnectToMockServiceControl);
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 4000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [projectId, retry]);

  async function act(route: string, body: unknown, message: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    version.current += 1;
    setBusy(true); setError(null); setNotice("");
    try {
      const next = await mockRequest(route, body, undefined, localeMessages);
      setState(next);
      if (route === "/start" && next.endpoint !== null) {
        // Verify the advertised independent URL from the browser, including CORS.
        const check = await fetch(`${next.endpoint}/scenarios`);
        if (!check.ok) throw new Error(formatLocaleMessage(localeMessages.mock.mockServiceStartedButConnectionCheckFailed, check.status));
      }
      setNotice(message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : localeMessages.mock.mockOperationFailed);
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function copyAddress() {
    if (!state?.endpoint) return;
    try {
      await navigator.clipboard.writeText(state.endpoint);
      setCopiedEndpoint(state.endpoint);
      setNotice(localeMessages.mock.mockAddressCopied);
    } catch { setError(localeMessages.mock.couldNotCopyAutomaticallySelectTheAddressAnd); }
  }

  const localSelected = state?.selection?.type === "recording";
  const selectedRecording = localSelected ? state?.recordings?.find(item => item.id === state.selection.id) : undefined;
  const selected = state?.scenarios.find((scenario) => scenario.id === (resourceSelection ?? state.scenarioId));
  const descriptions: Readonly<Record<string, string>> = localeMessages.mockDescriptions;
  const descriptionFor = (scenario: { id: string; description?: string | undefined }) => descriptions[scenario.id] ?? scenario.description;
  const titleFor = (scenario: { id: string; title: string }) => getDemoTitles(localeMessages)[scenario.id] ?? scenario.title;
  const search = query.trim().toLocaleLowerCase();
  const scenarios = state?.scenarios.filter((scenario) =>
    `${scenario.id} ${titleFor(scenario)} ${scenario.title} ${descriptionFor(scenario) ?? ""} ${(getDemoFocusTags(localeMessages)[scenario.id] ?? []).join(" ")}`.toLocaleLowerCase().includes(search),
  ).sort((first, second) => groupIndexFor(first.id, localeMessages) - groupIndexFor(second.id, localeMessages)
    || (getDemoOrderIndex(localeMessages).get(first.id) ?? 0) - (getDemoOrderIndex(localeMessages).get(second.id) ?? 0)) ?? [];

  return (
    <section className="creator-mock-panel creator-ui-scope" id="creator-mock-panel" aria-label={localeMessages.mock.mockAgentDevelopmentService} aria-busy={busy}>
      <header>
        <div className="creator-mock-heading"><FlaskConical aria-hidden="true" /><h2>{localeMessages.mock.mockAgent}</h2></div>
        <p>{localeMessages.mock.replayLocalMockRecordingsOrBuiltInDemos}</p>
      </header>
      {error === null ? null : <div className="creator-mock-error" role="alert">{localizeCreatorPresentation(error, localeMessages)}<Button size="sm" variant="outline" type="button" disabled={busy} onClick={() => setRetry((value) => value + 1)}>{localeMessages.mock.retryConnection}</Button></div>}
      {state === null ? <p role="status">{localeMessages.mock.readingMockServiceState}</p> : <>
        <Card className="creator-mock-service" role="region" aria-label={localeMessages.mock.serviceControls}>
          <div className="creator-mock-service-actions">
            <Badge variant="secondary" className="creator-mock-status" data-running={state.status === "running"}>
              {state.status === "running" ? localeMessages.mock.running : localeMessages.mock.stopped}
            </Badge>
            <Button size="sm" variant={state.status === "running" ? "outline" : "default"} type="button" disabled={busy} onClick={() => void act(
              state.status === "running" ? "/stop" : "/start", {},
              state.status === "running" ? localeMessages.mock.mockServiceStopped : localeMessages.mock.mockServiceStartedCreatorPreviewUsesTheSelected,
            )}>{busy ? localeMessages.mock.processing : state.status === "running" ? localeMessages.mock.stopService : localeMessages.mock.startService}</Button>
          </div>
          {state.endpoint === null ? <p>{localeMessages.mock.aLocalAddressAppearsAfterStartingAnAvailable}</p> : <>
            <div className="creator-mock-address-row">
            <label className="creator-mock-address">{localeMessages.mock.aGUIAddress}<Input readOnly value={state.endpoint} onFocus={(event) => event.target.select()} /></label>
            <Button size="sm" variant="outline" type="button" className="creator-mock-copy" data-copied={copiedEndpoint === state.endpoint} onClick={() => void copyAddress()}>
              {copiedEndpoint === state.endpoint ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copiedEndpoint === state.endpoint ? localeMessages.mock.copied : localeMessages.mock.copyAddress}
            </Button>
            </div>
            <details className="creator-mock-integration">
              <summary>{localeMessages.mock.howToConnect}</summary>
              <p>{localeMessages.mock.setTheComponentEndpointOrFrontendEnvironmentVariable}</p>
              <pre><code>{`<Agent endpoint="${state.endpoint}" />\n\nVITE_AGENT_ENDPOINT=${state.endpoint}`}</code></pre>
              <p>{localeMessages.mock.createOrEditThisFileAtTheRoot} <code>.env.local</code>{localeMessages.mock.andEnterTheValueAboveFor} <code>VITE_AGENT_ENDPOINT</code>。</p>
              <p>{localeMessages.mock.saveAndRestartYourFrontendDevelopmentServerAn}</p>
            </details>
          </>}
          <p>{localeMessages.mock.theServiceKeepsRunningAfterClosingThePanel}</p>
        </Card>
        <p className="creator-mock-notice" role="status">{localizeCreatorPresentation(notice, localeMessages)}</p>
        <section aria-label={localeMessages.mock.chooseMockSource}>
          <h3>{localeMessages.mock.mockSource}</h3>
          <p className="creator-mock-current-demo">{localeMessages.mock.current}<strong>{localSelected ? (selectedRecording?.title ?? state.selection.id) : (selected ? titleFor(selected) : state.scenarioId)}</strong></p>
          <p>{localeMessages.mock.source}{localSelected ? localeMessages.mock.localRecording : localeMessages.mock.builtInDemo}</p>
          <details className="creator-mock-demo-help"><summary>{localeMessages.mock.demoInstructions}</summary>
            <p>{localeMessages.mock.afterSelectingSendAMessageInTheConnected}</p>
            <p>{localeMessages.mock.someDemosRequireExtraAgentUIResourcesCreator}</p>
          </details>
          {compatibility?.status !== "checked" ? <p className="creator-mock-requirement" role="status">{compatibility === null ? localeMessages.mock.checkingDemoSupportInTheCurrentProject : localeMessages.mock.couldNotCheckProjectResourcesSelectAndInitialize}</p> : null}
          <label className="creator-mock-speed">{localeMessages.mock.replayDurationMultiplier}
            <NativeSelect disabled={busy} value={state.speed} onChange={(event) => void act("/select", { selection: state.selection ?? { type: "builtin", id: state.scenarioId }, projectId: state.projectId, speed: Number(event.target.value) }, localeMessages.mock.replayDurationUpdatedForTheNextRequest) }>
              <option value={0}>{localeMessages.mock.completeImmediately}</option><option value={0.1}>{localeMessages.mock.fastTest01}</option><option value={0.5}>{localeMessages.mock.faster05}</option><option value={1}>{localeMessages.mock.normal1}</option><option value={2}>{localeMessages.mock.slower2}</option>
            </NativeSelect>
          </label>
          <label className="creator-mock-search">{localeMessages.mock.searchMocks}<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={localeMessages.mock.nameEventCapabilityOrScenarioID} /></label>
          <section aria-label={localeMessages.mock.localMock}>
            <h3>{localeMessages.mock.localMock}</h3>
            <p>{localeMessages.mock.placeJSONLFilesInThisDirectoryInYour} <code>.agentui/mocks</code>{localeMessages.mock.thenSelectARecordingAndSendAMessage}</p>
            {projectPath ? <details className="creator-mock-file-location"><summary>{localeMessages.mock.viewRecordingDirectory}</summary><code>{projectPath.replace(/[\\/]$/, "")}/.agentui/mocks</code></details> : null}
            {state.recordingsError ? <p role="alert">{localeMessages.mock.couldNotReadLocalMock}{state.recordingsError}</p> : null}
            {(state.recordings ?? []).filter(item => `${item.title} ${item.fileName} ${item.id}`.toLocaleLowerCase().includes(search)).map(recording => <div key={recording.id} className="creator-mock-scenario" data-selected={localSelected && state.selection.id === recording.id}>
              <label className="creator-mock-scenario-choice">
                <input type="radio" name="creator-mock-scenario" checked={localSelected && state.selection.id === recording.id && resourceSelection === null} disabled={busy || recording.status !== "ready"}
                  onChange={() => { setResourceSelection(null); void act("/select", { selection: { type: "recording", id: recording.id }, projectId: state.projectId, speed: state.speed }, formatLocaleMessage(localeMessages.mock.selectedForTheNextRequest, recording.title)); }} />
                <span><strong>{recording.title}</strong><span>{recording.status === "ready" ? formatLocaleMessage(localeMessages.mock.eventsS, recording.eventCount, (recording.durationMs / 1000).toFixed(1)) : formatLocaleMessage(localeMessages.mock.couldNotRead, recording.error ?? localeMessages.mock.invalidFile)}</span></span>
              </label>
            </div>)}
            {!(state.recordings ?? []).length && !state.recordingsError ? <p>{localeMessages.mock.noLocalMockFilesInThisProjectYet}</p> : null}
          </section>
          <h3>{localeMessages.mock.builtInDemo}</h3>
          <p>{localeMessages.mock.tagsIdentifyEachDemoSEventsAndCapabilities}</p>
          <div className="creator-mock-scenarios">
            {scenarios.map((scenario, index) => <Fragment key={scenario.id}>
              {index === 0 || groupIndexFor(scenario.id, localeMessages) !== groupIndexFor(scenarios[index - 1]!.id, localeMessages)
                ? <h4 className="creator-mock-group-heading">{groupTitleFor(scenario.id, localeMessages)}</h4> : null}
              <div className="creator-mock-scenario" data-selected={!localSelected && scenario.id === state.scenarioId}>
              <label className="creator-mock-scenario-choice">
              <input type="radio" name="creator-mock-scenario" checked={scenario.id === resourceSelection || (resourceSelection === null && !localSelected && scenario.id === state.scenarioId)} disabled={busy} onChange={() => { if (scenario.resources?.length) setResourceSelection(scenario.id); else { setResourceSelection(null); void act("/select", { scenarioId: scenario.id, speed: state.speed }, formatLocaleMessage(localeMessages.mock.selectedForTheNextRequest, titleFor(scenario))); } }} />
              <span><strong>{titleFor(scenario)}</strong>{descriptionFor(scenario) ? <span>{descriptionFor(scenario)}</span> : null}
              </span></label>
              {getDemoFocusTags(localeMessages)[scenario.id]?.length ? <div className="creator-mock-focus-tags" role="group" aria-label={localeMessages.mock.featuredEventsAndCapabilities}>
                {getDemoFocusTags(localeMessages)[scenario.id]!.map(tag => <Badge key={tag} variant="secondary"
                  data-event-tag={/^(TEXT_MESSAGE_|REASONING_|TOOL_CALL_|RUN_|STATE_|ACTIVITY_|SUBAGENT_|CUSTOM\b)/.test(tag)}>{tag}</Badge>)}
              </div> : null}
              {requirementsFor(scenario.id).length > 0 ? <div className="creator-mock-scenario-footer">
                <div className="creator-mock-resource-actions">
                  <Button size="sm" variant="outline" type="button" disabled={busy || requirementsFor(scenario.id).some(item => !item.installable)} onClick={() => void installRequirements(scenario.id)}>

                    {localeMessages.mock.installResources}
                  </Button>
                </div>
                {compatibility?.projectId ? requirementsFor(scenario.id)
                  .filter(requirement => requirement.status === "conflict" || (installation?.resourceId === requirement.id && installation.status === "error"))
                  .map(requirement => <MockResourceDiagnostics key={`${compatibility.projectId}:${requirement.id}:${installation?.status}`} projectId={compatibility.projectId!} resourceId={requirement.id} />) : null}
              </div> : null}
              {scenario.resources?.length && resourceSelection === scenario.id ? <div>
                <p>{compatibility?.status === "checked" && requirementsFor(scenario.id).length === 0 ? localeMessages.mock.requiredResourcesReady : localeMessages.mock.thisScenarioNeedsAdditionalAgentUIResourcesInstall}</p>
                <Button size="sm" variant="outline" type="button" disabled={busy || compatibility?.status !== "checked" || requirementsFor(scenario.id).length > 0}
                  onClick={() => void act("/select", { scenarioId: scenario.id, speed: state.speed }, formatLocaleMessage(localeMessages.mock.enabledSendAMessageInAgentUITo, titleFor(scenario)))}>{localeMessages.mock.runScenario}</Button>
              </div> : null}
              {installation?.scenarioId === scenario.id ? <div className="creator-mock-install-status" data-status={installation.status} role={installation.status === "error" ? "alert" : "status"}>{localizeCreatorPresentation(installation.message, localeMessages)}</div> : null}
              {requirementsFor(scenario.id).some(requirement => !requirement.installable && requirement.status !== "conflict") ? <div className="creator-mock-install-status">{localeMessages.mock.thisCreatorHostDoesNotSupportOneClick}</div> : null}
              </div>
            </Fragment>)}
          </div>
          {scenarios.length === 0 ? <p>{localeMessages.mock.noMatchingDemos}</p> : null}
        </section>
      </>}
    </section>
  );
}

/** Fetch implementation data only after the developer explicitly opens diagnostics. */
function MockResourceDiagnostics({ projectId, resourceId }: { projectId: string; resourceId: string }) {
  const localeMessages = useAgentUILocale();
  const [details, setDetails] = useState<string | null>(null);
  const loading = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load(open: boolean) {
    if (!open || loading.current || details !== null) return;
    loading.current = true;
    controller.current = new AbortController();
    try {
      const response = await fetch(`${CREATOR_MOCK_API_PATH}/resource-diagnostics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, resourceId }), signal: controller.current.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(localeMessages.mock.couldNotReadTechnicalDetailsRefreshAndRetry);
      if (!controller.current.signal.aborted) setDetails(JSON.stringify(result, null, 2));
    } catch {
      if (!controller.current?.signal.aborted) setDetails(localeMessages.mock.couldNotReadTechnicalDetailsRefreshAndRetry);
    } finally { loading.current = false; }
  }
  return <details className="creator-mock-resource-diagnostics" onToggle={event => void load(event.currentTarget.open)}>
    <summary>{localeMessages.mock.viewTechnicalDetails}</summary>
    <pre>{details ?? localeMessages.mock.readingTechnicalDetails}</pre>
  </details>;
}
