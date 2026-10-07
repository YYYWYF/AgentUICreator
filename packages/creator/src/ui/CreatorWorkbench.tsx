import { parseCreatorCommand } from "../commands/parser.js";
import type { CreatorCommandActivity } from "../commands/types.js";
import { executeCreatorCommand } from "./workspaceClient.js";
import { useCreatorCommandState } from "./commands/useCreatorCommandState.js";
import { CreatorCommandMenu } from "./commands/CreatorCommandMenu.js";
import { useRef as useLocaleMessagesRef } from "react";
import { localizeCreatorPresentation, CreatorLocaleProvider, useCreatorLocaleState, type CreatorLocaleCode, useAgentUILocale, DEFAULT_CREATOR_MESSAGES, type CreatorLocaleMessages, formatLocaleMessage } from "./i18n/locale.js";
import { AgentConnectionPanel } from "./AgentConnectionPanel.js";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { MessageSchema, type Message } from "@ag-ui/client";
import ReactMarkdown from "react-markdown";
import { AlertCircle, ArrowUp, Bot, ChevronDown, FolderOpen, PanelsTopLeft, RotateCcw, RefreshCw, Settings, Sparkles, Square, UserRound, X } from "lucide-react";
import { Button } from "./components/button.js";
import { Badge } from "./components/badge.js";
import { Input } from "./components/input.js";
import { Textarea } from "./components/textarea.js";
import { Popover, PopoverContent, PopoverTrigger } from "./components/popover.js";
import remarkGfm from "remark-gfm";

import "./creator-workbench.css";

import type {
  CreatorFileChangeReceipt,
  CreatorRunReceipt,
  CreatorVerificationCheck,
  CreatorValidationReceipt,
} from "../receiptTypes.js";
import { CreatorAgentClient } from "../agent/CreatorAgentClient.js";
import { parseCreatorQuestion, type CreatorQuestionActivity } from "../agent/creatorInterruptTypes.js";
import { CreatorQuestionCard } from "./CreatorQuestionCard.js";
import { type CreatorProjectMode, type CreatorWorkspacePublicState } from "../workspace/types.js";
import { resolveCreatorDebugMode } from "./creatorDebug.js";
import { CreatorProjectSetup, type CreatorSetupDraft, type CreatorSetupError, type CreatorSetupInfoState, setupIssueMessage } from "./setup/CreatorProjectSetup.js";
import { CreatorProjectIntegrationGuide } from "./setup/CreatorProjectIntegrationGuide.js";
import { CreatorPluginUpdates } from "./CreatorPluginUpdates.js";
import { MockServicePanel } from "./MockServicePanel.js";
import { canInitializeCreatorProject, createEmptyCreatorSetupDraft, isCreatorSetupValidationUsable, isSetupRequestCurrent, shouldRefreshAfterInitializeError } from "./setup/creatorSetupState.js";
import { CreatorWorkspaceRequestError, chooseWorkspaceProject, clearWorkspaceProject, getWorkspaceSetup, getWorkspaceState, initializeWorkspaceProjectRequest, refreshWorkspaceProject, selectWorkspaceProject, validateWorkspaceSetup } from "./workspaceClient.js";
import {
  creatorStageTitle,
  interruptCreatorStage,
  isCreatorStageName,
  parseCreatorStepMetadata,
  projectCreatorIntentStage,
  reconcileCreatorStagesFromRunResult,
  type CreatorStageActivity,
  type CreatorStageName,
} from "./creatorStageProjection.js";
import { classifyCreatorReceiptPresentation, shouldPresentStage } from "./creatorConversationPresentation.js";

const STORAGE_KEY = "agent-ui-creator-conversation";
const WORKSPACE_PATH_STORAGE_KEY = "agent-ui-creator-selected-project-root";
const conversationKey = (workspaceId: string) => `${STORAGE_KEY}:${workspaceId}`;

function rememberedWorkspacePath(): string | null {
  try { return localStorage.getItem(WORKSPACE_PATH_STORAGE_KEY); } catch { return null; }
}

function rememberWorkspacePath(path: string | null): void {
  try {
    if (path === null) localStorage.removeItem(WORKSPACE_PATH_STORAGE_KEY);
    else localStorage.setItem(WORKSPACE_PATH_STORAGE_KEY, path);
  } catch { /* The project remains usable without browser storage. */ }
}
const CREATOR_PANEL_MIN_WIDTH = 280;
const CREATOR_PANEL_MAX_WIDTH = 720;
const CREATOR_PREVIEW_MIN_WIDTH = 320;
const CREATOR_PANEL_KEYBOARD_STEP = 16;

function CreatorSettings({ busy, onCheckUpdates, onAgent }: { busy: boolean; onCheckUpdates: () => void; onAgent: () => void }) {
  const localeMessages = useAgentUILocale();
  const localeState = useCreatorLocaleState();
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => { setPortalContainer(anchor.current?.closest<HTMLElement>(".creator-panel") ?? null); }, []);
  return (
    <div className="creator-settings creator-ui-scope" ref={anchor}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={localeMessages.creatorWorkbench.settings} title={localeMessages.creatorWorkbench.settings}>
            <Settings aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent container={portalContainer} align="end" className="cui:w-44 cui:p-1.5" aria-label={localeMessages.creatorWorkbench.settings}>
          <select aria-label={localeMessages.creatorWorkbench.language} value={localeState.locale} onChange={event => localeState.setLocale(event.target.value as CreatorLocaleCode)}><option value="zh-CN">{localeMessages.creatorWorkbench.chineseName}</option><option value="en-US">{localeMessages.creatorWorkbench.englishName}</option></select>
          <Button variant="ghost" size="sm" className="cui:w-full cui:justify-start" onClick={() => { setOpen(false); onAgent(); }}>Agent</Button>
          <Button variant="ghost" size="sm" className="cui:w-full cui:justify-start" disabled={busy} onClick={() => {
            setOpen(false);
            onCheckUpdates();
          }}>
            <RefreshCw aria-hidden="true" />

            {localeMessages.creatorWorkbench.checkUpdates}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function clampCreatorPanelWidth(width: number): number {
  const availableWidth = Math.max(
    CREATOR_PANEL_MIN_WIDTH,
    window.innerWidth - CREATOR_PREVIEW_MIN_WIDTH,
  );
  return Math.min(
    Math.max(width, CREATOR_PANEL_MIN_WIDTH),
    Math.min(CREATOR_PANEL_MAX_WIDTH, availableWidth),
  );
}

export interface CreatorWorkbenchContext {
  threadId: string;
  workspaceId: string;
}

interface CreatorWorkbenchProps {
  locale?: CreatorLocaleCode;
  onLocaleChange?: (locale: CreatorLocaleCode) => void;
  previewWorkspaceId?: string | undefined;
  layout?: "workbench" | "dock" | undefined;
  children:
    | ReactNode
    | ((context: CreatorWorkbenchContext) => ReactNode);
}

interface CreatorWorkbenchPreviewProps {
  children: CreatorWorkbenchProps["children"];
  threadId: string;
  workspaceId: string;
}

const CreatorWorkbenchPreview = memo(function CreatorWorkbenchPreview({
  children,
  threadId,
  workspaceId,
}: CreatorWorkbenchPreviewProps) {
  const localeMessages = useAgentUILocale();
  return (
    <section className="creator-workbench-preview" aria-label={localeMessages.creatorWorkbench.agentFrontendPreview}>
      {typeof children === "function" ? children({ threadId, workspaceId }) : children}
    </section>
  );
});

interface CreatorMessage {
  kind: "message";
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  receipt?: CreatorRunReceipt | undefined;
  streaming?: boolean | undefined;
}

interface CreatorToolActivity {
  kind: "tool";
  id: string;
  name: string;
  arguments: string;
  result?: string | undefined;
  error?: string | undefined;
  status: "preparing" | "running" | "completed" | "failed";
}

type CreatorConversationItem =
  | CreatorMessage
  | CreatorToolActivity
  | CreatorStageActivity
  | CreatorQuestionActivity
  | CreatorCommandActivity;

interface CreatorToolGroup {
  kind: "tool-group";
  id: string;
  activities: CreatorToolActivity[];
}

function presentConversationItems(items: CreatorConversationItem[], debug: boolean): (Exclude<CreatorConversationItem, CreatorToolActivity> | CreatorToolGroup)[] {
  const presented: (Exclude<CreatorConversationItem, CreatorToolActivity> | CreatorToolGroup)[] = [];
  for (const item of items) {
    if (item.kind === "stage" && !shouldPresentStage(item, debug)) continue;
    if (item.kind !== "tool") {
      presented.push(item);
      continue;
    }
    const previous = presented.at(-1);
    if (previous?.kind === "tool-group") previous.activities.push(item);
    else presented.push({ kind: "tool-group", id: `tools-${item.id}`, activities: [item] });
  }
  return presented;
}

const hasPendingCreatorQuestion = (items: CreatorConversationItem[]) =>
  items.some(item => item.kind === "question" && (item.status === "pending" || item.status === "submitting"));

const questionContextIsGone = (code: string | undefined) =>
  code === "CREATOR_INTERRUPT_NOT_FOUND" || code === "CREATOR_INTERRUPT_CONTEXT_INVALID";

interface StoredCreatorConversation {
  threadId: string;
  items: CreatorConversationItem[];
  agentMessages: Message[];
}

function getRoleLabels(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Record<CreatorMessage["role"], string> { return {
  user: localeMessages.creatorWorkbench.user,
  assistant: localeMessages.creatorWorkbench.creator,
  error: localeMessages.creatorWorkbench.error,
}; }

function getFileStatusLabels(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Record<CreatorFileChangeReceipt["status"], string> { return {
  created: localeMessages.creatorWorkbench.created,
  modified: localeMessages.creatorWorkbench.modified,
  deleted: localeMessages.creatorWorkbench.deleted,
}; }

function getValidationStatusLabels(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Record<
  CreatorValidationReceipt["status"],
  string
> { return {
  passed: localeMessages.creatorWorkbench.passed,
  failed: localeMessages.creatorWorkbench.failed,
}; }

function getVerificationCheckStatusLabels(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Record<
  CreatorVerificationCheck["status"],
  string
> { return {
  passed: localeMessages.creatorWorkbench.passed,
  failed: localeMessages.creatorWorkbench.failed,
  stale: localeMessages.creatorWorkbench.runtimeHasNotObservedTheUpdate,
  unavailable: localeMessages.creatorWorkbench.runtimeTemporarilyUnavailable,
}; }

function verificationCheckStatusLabel(check: CreatorVerificationCheck, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): string {
  if (check.id === "operation-postcondition") {
    if (check.status === "unavailable") return localeMessages.creatorWorkbench.requestOutcomeUnconfirmed;
    if (check.status === "failed") return localeMessages.creatorWorkbench.requestTargetNotSatisfied;
  }
  if (check.id === "static-validation") {
    if (check.status === "unavailable") return localeMessages.creatorWorkbench.staticValidationIncomplete;
    if (check.status === "failed") return localeMessages.creatorWorkbench.staticValidationFailed;
  }
  return getVerificationCheckStatusLabels(localeMessages)[check.status];
}

function getVerificationStatusLabels(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Record<
  NonNullable<CreatorRunReceipt["verification"]>["status"],
  string
> { return {
  "not-run": localeMessages.creatorWorkbench.completionVerificationNotPerformed,
  "changed-and-statically-verified": localeMessages.creatorWorkbench.changesPassedStaticValidation,
  "changed-and-verified": localeMessages.creatorWorkbench.changesVerified,
  "changed-unverified": localeMessages.creatorWorkbench.changesCommittedCompletionVerificationUnconfirmed,
  "no-project-change": localeMessages.creatorWorkbench.projectUnchanged,
  "decision-no-project-change": localeMessages.creatorWorkbench.endedByUserDecisionProjectUnchanged,
  failed: localeMessages.creatorWorkbench.completionVerificationFailed,
}; }

function getToolStatusLabels(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Record<CreatorToolActivity["status"], string> { return {
  preparing: localeMessages.creatorWorkbench.preparing,
  running: localeMessages.creatorWorkbench.executing,
  completed: localeMessages.creatorWorkbench.completed,
  failed: localeMessages.creatorWorkbench.executionFailed,
}; }

const creatorStageNames: CreatorStageName[] = [
  "creator.grounding",
  "creator.resolve",
  "creator.productized-operation",
];

const markdownPlugins = [remarkGfm];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCreatorRunReceipt(value: unknown): value is CreatorRunReceipt {
  if (
    !isRecord(value) ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.validations)
  ) {
    return false;
  }

  return (
    value.files.every(
      (file) =>
        isRecord(file) &&
        typeof file.path === "string" &&
        (file.status === "created" ||
          file.status === "modified" ||
          file.status === "deleted") &&
        typeof file.diff === "string" &&
        typeof file.truncated === "boolean",
    ) &&
    value.validations.every(
      (validation) =>
        isRecord(validation) &&
        typeof validation.command === "string" &&
        (validation.status === "passed" || validation.status === "failed") &&
        (typeof validation.exitCode === "number" ||
          validation.exitCode === null) &&
        typeof validation.output === "string" &&
        typeof validation.truncated === "boolean" &&
        (validation.revision === undefined ||
          typeof validation.revision === "number"),
    ) &&
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
        value.verification.checks.every(
          (check) =>
            isRecord(check) &&
            typeof check.id === "string" &&
            (check.status === "passed" ||
              check.status === "failed" ||
              check.status === "stale" ||
              check.status === "unavailable") &&
            typeof check.evidence === "string",
        ))) &&
    (value.pluginDeliveries === undefined ||
      (Array.isArray(value.pluginDeliveries) && value.pluginDeliveries.every((report) =>
        isRecord(report) && typeof report.pluginId === "string" &&
        typeof report.projectRevision === "number" &&
        isRecord(report.decision) && typeof report.decision.type === "string" &&
        isRecord(report.authorization) && typeof report.authorization.status === "string" &&
        isRecord(report.delivery) &&
        (typeof report.delivery.status === "string" && ["planning", "created", "registered", "composed", "verified", "statically-verified", "completed", "blocked"].includes(report.delivery.status)) &&
        typeof report.delivery.lastSuccessfulStage === "string" &&
        Array.isArray(report.delivery.blockers) && report.delivery.blockers.every((item) => typeof item === "string") &&
        Array.isArray(report.delivery.instanceIds) && report.delivery.instanceIds.every((item) => typeof item === "string") &&
        isRecord(report.delivery.stages) && Object.values(report.delivery.stages).every((item) => typeof item === "boolean") &&
        isRecord(report.verification) && Object.values(report.verification).every((item) => typeof item === "string")
      ))) &&
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
        (value.transaction.reapplied === undefined || typeof value.transaction.reapplied === "boolean")))
  );
}

function receiptFromRunResult(value: unknown, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): CreatorRunReceipt | undefined {
  if (!isRecord(value) || value.receipt === undefined) {
    return undefined;
  }
  if (!isCreatorRunReceipt(value.receipt)) {
    throw new Error(localeMessages.creatorWorkbench.creatorReturnedAnInvalidRunReceipt);
  }
  return value.receipt;
}

function creatorAgentMessages(messages: CreatorMessage[]): Message[] {
  return messages.flatMap((message): Message[] => {
    if (message.role === "user") {
      return [{ id: message.id, role: "user", content: message.content }];
    }
    if (message.role === "assistant") {
      return [{ id: message.id, role: "assistant", content: message.content }];
    }
    return [];
  });
}

function storedItem(value: unknown, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): CreatorConversationItem | undefined {
  if (!isRecord(value) || typeof value.id !== "string") {
    return undefined;
  }
  if (value.kind === "command" && typeof value.commandId === "string" && ["running", "completed", "failed"].includes(String(value.status))) {
    return { kind: "command", id: value.id, commandId: value.commandId,
      ...(value.reenabled === true ? { reenabled: true } : {}),
      status: value.status === "completed" ? "completed" : "failed",
      ...(typeof value.value === "string" ? { value: value.value } : {}),
      ...(typeof value.error === "string" ? { error: value.error } : value.status === "running" ? { error: localeMessages.commands.interrupted } : {}),
      ...(isCreatorRunReceipt(value.receipt) ? { receipt: value.receipt } : {}) };
  }
  if (value.kind === "question") return parseCreatorQuestion(value);

  if (
    value.kind === "stage" &&
    isCreatorStageName(value.name) &&
    (value.status === "running" ||
      value.status === "completed" ||
      value.status === "failed")
  ) {
    const metadata = parseCreatorStepMetadata({ creator: value.metadata });
    const interrupted = value.status === "running";
    const displayIntent =
      typeof value.displayIntent === "string" ? value.displayIntent : undefined;
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

  if (
    value.kind === "tool" &&
    typeof value.name === "string" &&
    typeof value.arguments === "string" &&
    (value.status === "preparing" ||
      value.status === "running" ||
      value.status === "completed" ||
      value.status === "failed")
  ) {
    const interrupted =
      value.status === "preparing" || value.status === "running";
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
  if (
    (value.kind === "message" || value.kind === undefined) &&
    (role === "user" || role === "assistant" || role === "error") &&
    typeof value.content === "string"
  ) {
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

function parsedItems(value: unknown, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): CreatorConversationItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const parsed = storedItem(item, localeMessages);
    return parsed === undefined ? [] : [parsed];
  });
}

function parsedAgentMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((message) => {
    const parsed = MessageSchema.safeParse(message);
    return parsed.success ? [parsed.data] : [];
  });
}

function emptyConversation(): StoredCreatorConversation {
  return { threadId: crypto.randomUUID(), items: [], agentMessages: [] };
}

function storedConversation(workspaceId: string, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): StoredCreatorConversation {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(conversationKey(workspaceId)) ?? "null",
    );

    if (Array.isArray(value)) {
      const items = parsedItems(value, localeMessages);
      const textMessages = items.filter(
        (item): item is CreatorMessage => item.kind === "message",
      );
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
  } catch {
    // A corrupt development-only session should not prevent the preview loading.
  }

  return emptyConversation();
}

function saveConversation(
  agent: CreatorAgentClient,
  items: CreatorConversationItem[],
  workspaceId: string,
): void {
  sessionStorage.setItem(
    conversationKey(workspaceId),
    JSON.stringify({
      threadId: agent.threadId,
      items: items.slice(-60),
      agentMessages: agent.messages,
    } satisfies StoredCreatorConversation),
  );
}

function CreatorMarkdown({ content }: { content: string }) {
  return (
    <div className="creator-markdown">
      <ReactMarkdown remarkPlugins={markdownPlugins}>{content}</ReactMarkdown>
    </div>
  );
}

function CreatorRunDiagnostics({ diagnosticLog }: { diagnosticLog: NonNullable<CreatorRunReceipt["diagnosticLog"]> }) {
  const localeMessages = useAgentUILocale();
  return (
    <div className="creator-receipt-section">
      <h2>{localeMessages.creatorWorkbench.diagnosticLog}</h2>
      <div className="creator-receipt-meta">

        {localeMessages.creatorWorkbench.creatorSavedTheModelToolAndValidationTrace}
      </div>
      <pre aria-label={localeMessages.creatorWorkbench.creatorDiagnosticLogPath}>
        <code>{diagnosticLog.path}</code>
      </pre>
      <div className="creator-receipt-note">

        {localeMessages.creatorWorkbench.logsMayContainUserRequestsProjectContentAnd}
      </div>
    </div>
  );
}

function CreatorValidationSections({ validations, showHeading = true }: { validations: CreatorValidationReceipt[]; showHeading?: boolean }) {
  const localeMessages = useAgentUILocale();
  if (validations.length === 0) return null;
  return (
    <div className="creator-receipt-section">
      {showHeading ? <h2>{localeMessages.creatorWorkbench.validationResults}</h2> : null}
      {validations.map((validation, index) => (
        <details className="creator-receipt-item" key={`${validation.command}-${index}`}>
          <summary>
            <span className={`creator-receipt-status creator-receipt-status--${validation.status}`}>
              {getValidationStatusLabels(localeMessages)[validation.status]}
            </span>
            <code>{validation.command}</code>
          </summary>
          <div className="creator-receipt-meta">

            {localeMessages.creatorWorkbench.revision}{validation.revision ?? localeMessages.creatorWorkbench.legacyReceipt} {localeMessages.creatorWorkbench.exitCode}
            {validation.exitCode ?? localeMessages.creatorWorkbench.unavailable}
          </div>
          <pre aria-label={formatLocaleMessage(localeMessages.creatorWorkbench.output, validation.command)}>
            <code>{validation.output || localeMessages.creatorWorkbench.noCommandOutput}</code>
          </pre>
          {validation.truncated ? (
            <div className="creator-receipt-note">{localeMessages.creatorWorkbench.validationOutputTruncated}</div>
          ) : null}
        </details>
      ))}
    </div>
  );
}

function CreatorPluginDeliveryReports({ receipt }: { receipt: CreatorRunReceipt }) {
  const localeMessages = useAgentUILocale();
  return <>{receipt.pluginDeliveries?.map(report => (
    <div className="creator-receipt-section creator-delivery-report" key={report.pluginId}>
      <h2>{localeMessages.creatorWorkbench.pluginDelivery}{report.pluginId}</h2>
      <p>{report.delivery.status === "completed" ? localeMessages.creatorWorkbench.deliveryComplete : report.delivery.status === "statically-verified" ? localeMessages.creatorWorkbench.staticChecksPassedRuntimeAndBrowserUnverified : report.delivery.status === "blocked" ? localeMessages.creatorWorkbench.deliveryBlocked : localeMessages.creatorWorkbench.deliveryInProgress}</p>
      <div className="creator-delivery-checks">{Object.entries(report.verification).map(([name, status]) => (
        <span key={name} title={`${name}: ${status}`}>{({ static: localeMessages.creatorWorkbench.staticChecks, runtime: localeMessages.creatorWorkbench.runVerification, geometry: localeMessages.creatorWorkbench.layoutVerification } as Record<string, string>)[name] ?? name}：{({ pass: localeMessages.creatorWorkbench.passed, "not-passed": localeMessages.creatorWorkbench.failed2, "not-run": localeMessages.creatorWorkbench.unverified, failed: localeMessages.creatorWorkbench.failed } as Record<string, string>)[status] ?? creatorDiagnosticValue(status, localeMessages)}</span>
      ))}</div>
      {report.delivery.blockers.map(blocker => <p className="creator-delivery-blocker" key={blocker}>{blocker}</p>)}
      <details><summary>{localeMessages.creatorWorkbench.deliveryDetails}</summary><p>{localeMessages.creatorWorkbench.plan}{report.decision.type} {localeMessages.creatorWorkbench.authorization}{report.authorization.status} {localeMessages.creatorWorkbench.stage}{report.delivery.lastSuccessfulStage}</p></details>
    </div>
  ))}</>;
}

function CreatorMutationReceipt({ receipt, debug, onUndo, onReapply, undoBusy, reapplyBusy }: { receipt: CreatorRunReceipt; debug: boolean; onUndo?: ((runId: string) => void) | undefined; onReapply?: ((runId: string) => void) | undefined; undoBusy?: boolean | undefined; reapplyBusy?: boolean | undefined }) {
  const localeMessages = useAgentUILocale();
  const verification = receipt.verification;
  const verificationPassed =
    verification?.status === "changed-and-statically-verified" ||
    verification?.status === "changed-and-verified" ||
    verification?.status === "no-project-change" ||
    verification?.status === "decision-no-project-change";
  const verificationTone =
    verification?.status === "changed-unverified"
      ? "unavailable"
      : verificationPassed
        ? "passed"
        : "failed";
  const verificationLabel =
    verification === undefined
      ? ""
      : verification.status === "changed-unverified"
        ? verification.checks.some(
            (check) =>
              check.id === "operation-postcondition" &&
              check.status === "unavailable",
          )
          ? localeMessages.creatorWorkbench.changesCommittedRequestOutcomeUnconfirmed
          : verification.runtimeStatus === "stale"
            ? localeMessages.creatorWorkbench.changesCommittedRuntimeHasNotObservedTheUpdate
            : verification.runtimeStatus === "unavailable"
              ? localeMessages.creatorWorkbench.changesCommittedRuntimeTemporarilyUnavailable
              : localeMessages.creatorWorkbench.changesCommittedRequestOutcomeUnconfirmed
        : getVerificationStatusLabels(localeMessages)[verification.status];

  return (
    <section className="creator-receipt" aria-label={localeMessages.creatorWorkbench.changeReceipt}>
      <header className="creator-receipt-header">
        <strong>{localeMessages.creatorWorkbench.changeReceipt}</strong>
        <span>
          {receipt.files.length} {localeMessages.creatorWorkbench.files}
          {receipt.validations.length > 0 ? formatLocaleMessage(localeMessages.creatorWorkbench.validations, receipt.validations.length) : ""}
        </span>
      </header>

      <CreatorPluginDeliveryReports receipt={receipt} />
      {receipt.transaction === undefined ? null : (
        <div className="creator-receipt-section">
          <h2>{localeMessages.creatorWorkbench.changeOperation}</h2>
          <div className="creator-receipt-meta">
            <span
              className={`creator-receipt-status creator-receipt-status--${
                receipt.transaction.undone ? "undone" : receipt.transaction.undoable ? "passed" : "failed"
              }`}
            >
              {receipt.transaction.undone ? localeMessages.creatorWorkbench.undone : receipt.transaction.undoable ? localeMessages.creatorWorkbench.canUndo : localeMessages.creatorWorkbench.cannotUndoNow}
            </span>
            {debug ? <> · Run <code>{receipt.transaction.runId}</code></> : null}
          </div>
          <div className="creator-receipt-note">
            {receipt.transaction.undone
              ? receipt.transaction.reapplyable
                ? localeMessages.creatorWorkbench.allFilesAreCheckedBeforeReapplyingLaterManual
                : localeMessages.creatorWorkbench.filesRestoredToTheirPreviousStateThisRecord
              : localeMessages.creatorWorkbench.allFilesAreCheckedAgainWhenUndoingLater}
            {receipt.transaction.reapplied ? localeMessages.creatorWorkbench.reappliedChangesHaveNotBeenReverified : null}
          </div>
          {receipt.transaction.undoable && onUndo !== undefined ? (
            <Button size="sm" variant="outline" className="creator-receipt-action" type="button" disabled={undoBusy} onClick={() => onUndo(receipt.transaction!.runId)}>
              {undoBusy ? localeMessages.creatorWorkbench.undoing : localeMessages.creatorWorkbench.undoTheseChanges}
            </Button>
          ) : null}
          {receipt.transaction.undone && receipt.transaction.reapplyable && onReapply !== undefined ? (
            <Button size="sm" variant="outline" className="creator-receipt-action creator-receipt-action--reapply" type="button" disabled={reapplyBusy} onClick={() => onReapply(receipt.transaction!.runId)}>
              {reapplyBusy ? localeMessages.creatorWorkbench.reapplying : localeMessages.creatorWorkbench.reapplyTheseChanges}
            </Button>
          ) : null}
        </div>
      )}

      {verification === undefined ? null : (
        <div className="creator-receipt-section">
          <h2>{receipt.transaction?.undone || receipt.transaction?.reapplied ? localeMessages.creatorWorkbench.originalRunVerification : localeMessages.creatorWorkbench.completionVerification}</h2>
          <div className="creator-receipt-meta">
            <span
              className={`creator-receipt-status creator-receipt-status--${
                verificationTone
              }`}
            >
              {verificationLabel}
            </span>{" "}
            · Revision {verification.projectRevision} {localeMessages.creatorWorkbench.rechecks} {verification.auditAttempts} {localeMessages.creatorWorkbench.times}
          </div>
          {verification.checks.map((check) => (
            <details className="creator-receipt-item" key={check.id}>
              <summary>
                <span
                  className={`creator-receipt-status creator-receipt-status--${check.status}`}
                >
                  {verificationCheckStatusLabel(check, localeMessages)}
                </span>
                <code>{check.id}</code>
              </summary>
              <pre>
                <code>{check.evidence}</code>
              </pre>
            </details>
          ))}
        </div>
      )}

      {debug && receipt.diagnosticLog !== undefined ? (
        <CreatorRunDiagnostics diagnosticLog={receipt.diagnosticLog} />
      ) : null}

      <div className="creator-receipt-section">
        <h2>{localeMessages.creatorWorkbench.fileChanges}</h2>
        {receipt.files.map((file) => (
          <details className="creator-receipt-item" key={file.path}>
            <summary>
              <span className={`creator-receipt-status creator-receipt-status--${file.status}`}>
                {getFileStatusLabels(localeMessages)[file.status]}
              </span>
              <code>{file.path}</code>
            </summary>
            <pre aria-label={`${file.path} Diff`}>
              <code>{file.diff}</code>
            </pre>
            {file.truncated ? (
              <div className="creator-receipt-note">{localeMessages.creatorWorkbench.diffTruncated}</div>
            ) : null}
          </details>
        ))}
      </div>
      <CreatorValidationSections validations={receipt.validations} />
    </section>
  );
}

function CreatorRunReceiptPresentation({ receipt, debug, onUndo, onReapply, undoBusy, reapplyBusy }: { receipt: CreatorRunReceipt; debug: boolean; onUndo?: ((runId: string) => void) | undefined; onReapply?: ((runId: string) => void) | undefined; undoBusy?: boolean | undefined; reapplyBusy?: boolean | undefined }) {
  const localeMessages = useAgentUILocale();
  const presentation = classifyCreatorReceiptPresentation(receipt);
  if (presentation === "mutation") {
    return <CreatorMutationReceipt receipt={receipt} debug={debug} onUndo={onUndo} onReapply={onReapply} undoBusy={undoBusy} reapplyBusy={reapplyBusy} />;
  }
  if (presentation === "outcome") {
    return <section className="creator-receipt" aria-label={localeMessages.creatorWorkbench.outcome}>
      <header className="creator-receipt-header"><strong>{localeMessages.creatorWorkbench.outcome}</strong><span>{receipt.files.length} {localeMessages.creatorWorkbench.files}</span></header>
      {receipt.verification ? <div className="creator-receipt-section"><p>{getVerificationStatusLabels(localeMessages)[receipt.verification.status]}</p></div> : null}
      <CreatorPluginDeliveryReports receipt={receipt} />
      <CreatorValidationSections validations={receipt.validations} />
      {debug && receipt.diagnosticLog ? <CreatorRunDiagnostics diagnosticLog={receipt.diagnosticLog} /> : null}
    </section>;
  }
  if (presentation === "validation") {
    return (
      <section className="creator-receipt" aria-label={localeMessages.creatorWorkbench.validationResults}>
        <header className="creator-receipt-header">
          <strong>{localeMessages.creatorWorkbench.validationResults}</strong>
          <span>{receipt.validations.length} {localeMessages.creatorWorkbench.validations2}</span>
        </header>
        <CreatorValidationSections validations={receipt.validations} showHeading={false} />
        {debug && receipt.diagnosticLog !== undefined ? (
          <CreatorRunDiagnostics diagnosticLog={receipt.diagnosticLog} />
        ) : null}
      </section>
    );
  }
  if (debug && receipt.diagnosticLog !== undefined) {
    return (
      <section className="creator-receipt" aria-label={localeMessages.creatorWorkbench.runDiagnostics}>
        <header className="creator-receipt-header"><strong>{localeMessages.creatorWorkbench.runDiagnostics}</strong></header>
        <CreatorRunDiagnostics diagnosticLog={receipt.diagnosticLog} />
      </section>
    );
  }
  return null;
}

function CreatorToolGroupCard({ activities }: { activities: CreatorToolActivity[] }) {
  const localeMessages = useAgentUILocale();
  const pending = activities.filter(activity => activity.status === "preparing" || activity.status === "running");
  const failed = activities.filter(activity => activity.status === "failed").length;
  return <details className="creator-tool-group" aria-label={localeMessages.creatorWorkbench.toolExecutionDetails}>
    <summary>
      <ChevronDown aria-hidden="true" className="creator-tool-group-chevron" />
      <strong>{localeMessages.creatorWorkbench.toolCall} {activities.length} {localeMessages.creatorWorkbench.times}</strong>
      <span className={`creator-tool-group-status${failed ? " creator-tool-group-status--failed" : ""}`}>
        {pending.length ? <><RefreshCw aria-hidden="true" className="creator-tool-group-spinner" />{localeMessages.creatorWorkbench.running}</> : failed ? formatLocaleMessage(localeMessages.creatorWorkbench.failures, failed) : localeMessages.creatorWorkbench.completed}
        {pending.length && failed ? formatLocaleMessage(localeMessages.creatorWorkbench.failures2, failed) : null}
      </span>
    </summary>
    <div className="creator-tool-group-body">
      {activities.map(activity => <CreatorToolActivityCard activity={activity} key={activity.id} />)}
    </div>
  </details>;
}

function CreatorToolActivityCard({
  activity,
}: {
  activity: CreatorToolActivity;
}) {
  const localeMessages = useAgentUILocale();
  return (
    <article
      aria-label={formatLocaleMessage(localeMessages.creatorWorkbench.toolCall2, activity.name)}
      className={`creator-tool-activity creator-tool-activity--${activity.status}`}
    >
      <header>
        <span className="creator-tool-activity-dot" aria-hidden="true" />
        <strong>{activity.name}</strong>
        <Badge variant="secondary" className="creator-tool-status">{getToolStatusLabels(localeMessages)[activity.status]}</Badge>
      </header>

      {activity.arguments === "" ? null : (
        <details open={activity.status === "preparing"}>
          <summary>{localeMessages.creatorWorkbench.callArguments}</summary>
          <pre>
            <code>{activity.arguments}</code>
          </pre>
        </details>
      )}

      {activity.result === undefined ? null : (
        <details open={activity.status === "failed"}>
          <summary>{localeMessages.creatorWorkbench.toolResult}</summary>
          <pre>
            <code>{activity.result}</code>
          </pre>
        </details>
      )}

      {activity.error === undefined ? null : (
        <p className="creator-tool-activity-error">{activity.error}</p>
      )}
    </article>
  );
}

function stageSymbol(status: CreatorStageActivity["status"]): string {
  if (status === "running") return "○";
  if (status === "failed") return "✗";
  return "✓";
}

function debugValue(value: unknown, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): string {
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ");
  if (value === true) return localeMessages.creatorWorkbench.yes;
  if (value === false) return localeMessages.creatorWorkbench.no;
  if (value === null || value === undefined) return "—";
  return String(value);
}

// Translate presentation values while preserving raw diagnostic values in titles.
function creatorDiagnosticValue(value: unknown, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): string {
  const labels: Record<string, string> = {
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

function CreatorStageDebugDetails({
  activity,
}: {
  activity: CreatorStageActivity;
}) {
  const localeMessages = useAgentUILocale();
  const metadata = activity.metadata ?? {};
  const isUnderstanding = activity.name === "creator.resolve";
  const isGrounding = activity.name === "creator.grounding";
  const isExecution = activity.name === "creator.productized-operation";

  const rows = (
    values: Array<[string, unknown]>,
  ) => (
    <dl className="creator-stage-details-list">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd title={debugValue(value, localeMessages)}>{creatorDiagnosticValue(value, localeMessages)}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <div className="creator-stage-debug">
      {isGrounding ? (
        <section>
          <h3>{localeMessages.creatorWorkbench.contextPreparation}</h3>
          {rows([
            [localeMessages.creatorWorkbench.snapshotGenerationTime, metadata.snapshotBuildMs === undefined ? "—" : `${metadata.snapshotBuildMs} ms`],
            [localeMessages.creatorWorkbench.modelCalls, metadata.modelCalls ?? 0],
            [localeMessages.creatorWorkbench.errorCode, metadata.errorCode],
          ])}
        </section>
      ) : null}

      {isUnderstanding ? (
        <>
          <section>
            <h3>{localeMessages.creatorWorkbench.requestUnderstanding}</h3>
            {rows([
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
                    [localeMessages.creatorWorkbench.repairReasonCode, metadata.actionSelectorRepairReasonCode] as [string, unknown],
                    [localeMessages.creatorWorkbench.repairReason, metadata.actionSelectorRepairReason] as [string, unknown],
                  ]
                : []),
              [localeMessages.creatorWorkbench.modelCalls, metadata.modelCalls],
              [localeMessages.creatorWorkbench.repairCalls, metadata.repairCalls],
              [localeMessages.creatorWorkbench.duration, metadata.durationMs === undefined ? "—" : `${metadata.durationMs} ms`],
              [localeMessages.creatorWorkbench.candidateCount, metadata.candidateCount],
              [localeMessages.creatorWorkbench.contextCharacters, metadata.contextCharacters],
            ])}
          </section>
          <section>
            <h3>{localeMessages.creatorWorkbench.changeTarget}</h3>
            {rows([
              [localeMessages.creatorWorkbench.plugin, metadata.targetPluginIds],
              [localeMessages.creatorWorkbench.instance, metadata.targetInstanceIds],
            ])}
          </section>
          {metadata.placementType === undefined ? null : (
            <section>
              <h3>{localeMessages.creatorWorkbench.placementVerification}</h3>
              {rows([
                [localeMessages.creatorWorkbench.type, metadata.placementType],
                [localeMessages.creatorWorkbench.anchorPlugin, metadata.anchorPluginId],
                [localeMessages.creatorWorkbench.anchorInstance, metadata.anchorInstanceId],
                [localeMessages.creatorWorkbench.relativeRelationship, metadata.relation],
                [localeMessages.creatorWorkbench.parentPlugin, metadata.parentPluginId],
                [localeMessages.creatorWorkbench.parentInstance, metadata.parentInstanceId],
                [localeMessages.creatorWorkbench.slot, metadata.slot],
              ])}
            </section>
          )}
          {metadata.effectType === undefined ? null : (
            <section>
              <h3>{localeMessages.creatorWorkbench.scope}</h3>
              {rows([
                [localeMessages.creatorWorkbench.type, metadata.effectType],
                [localeMessages.creatorWorkbench.region, metadata.region],
                [localeMessages.creatorWorkbench.parentPlugin, metadata.parentPluginId],
                [localeMessages.creatorWorkbench.parentInstance, metadata.parentInstanceId],
                [localeMessages.creatorWorkbench.slot, metadata.slot],
              ])}
            </section>
          )}
          <section>
            <h3>{localeMessages.creatorWorkbench.executionRoute}</h3>
            {rows([
              [localeMessages.creatorWorkbench.predefinedOperation, metadata.route === "productized"],
              [localeMessages.creatorWorkbench.generalAgent, metadata.route === "general-agent"],
              [localeMessages.creatorWorkbench.clarificationNeeded, metadata.route === "clarification"],
              [localeMessages.creatorWorkbench.unsupported, metadata.route === "unsupported"],
            ])}
          </section>
          {metadata.route === "general-agent" ? (
            <section>
              <h3>{localeMessages.creatorWorkbench.generalAgent}</h3>
              {rows([
                [localeMessages.creatorWorkbench.modelCalls, metadata.generalAgentModelCalls],
                [localeMessages.creatorWorkbench.toolCalls, metadata.generalAgentToolCalls],
                [localeMessages.creatorWorkbench.totalModelCalls, metadata.totalModelCalls],
              ])}
            </section>
          ) : null}
        </>
      ) : null}

      {isExecution ? (
        <>
          <section>
            <h3>{localeMessages.creatorWorkbench.changeExecution}</h3>
            {rows([
              [localeMessages.creatorWorkbench.executionModelCalls, metadata.executionModelCalls],
              [localeMessages.creatorWorkbench.toolCalls, metadata.toolCalls],
              [localeMessages.creatorWorkbench.deepAgentCalls, metadata.deepAgentCalls],
              [localeMessages.creatorWorkbench.changeAttempts, metadata.mutationAttempts],
            ])}
          </section>
          <section>
            <h3>{localeMessages.creatorWorkbench.validationResults}</h3>
            {rows([
              [localeMessages.creatorWorkbench.verificationMethod, metadata.verificationMode],
              [localeMessages.creatorWorkbench.staticValidation, metadata.staticStatus],
              [localeMessages.creatorWorkbench.runtimeValidation, metadata.runtimeStatus],
              [localeMessages.creatorWorkbench.freshnessChecks, metadata.runtimeFreshnessAttempts],
              [localeMessages.creatorWorkbench.runtimeWait, metadata.runtimeFreshnessWaitMs === undefined ? "—" : `${metadata.runtimeFreshnessWaitMs} ms`],
              [localeMessages.creatorWorkbench.placementVerification, metadata.placementVerified],
              [localeMessages.creatorWorkbench.geometryVerification, metadata.geometryVerified],
            ])}
          </section>
        </>
      ) : null}
    </div>
  );
}

function CreatorStageActivityCard({
  activity,
  debug,
}: {
  activity: CreatorStageActivity;
  debug: boolean;
}) {
  const localeMessages = useAgentUILocale();
  if (!shouldPresentStage(activity, debug)) {
    return null;
  }
  return (
    <article
      aria-label={debug ? formatLocaleMessage(localeMessages.creatorWorkbench.creatorStage, activity.name) : creatorStageTitle(activity, localeMessages)}
      className={`creator-stage-activity creator-stage-activity--${activity.status}`}
    >
      <div className="creator-stage-summary">
        <span className="creator-stage-symbol" aria-hidden="true">
          {stageSymbol(activity.status)}
        </span>
        <div>
          <strong>{creatorStageTitle(activity, localeMessages)}</strong>
          {activity.name === "creator.resolve" &&
          activity.displayIntent !== undefined &&
          activity.metadata?.route !== "clarification" &&
          activity.status === "completed" ? (
            <span className="creator-stage-intent">{activity.displayIntent}</span>
          ) : null}
          {activity.error === undefined ? null : (
            <span className="creator-stage-error">{activity.error}</span>
          )}
        </div>
      </div>
      {debug ? (
        <details className="creator-stage-diagnostics">
          <summary>{localeMessages.creatorWorkbench.diagnosticDetails}</summary>
          <CreatorStageDebugDetails activity={activity} />
        </details>
      ) : null}
    </article>
  );
}

function setupError(error: unknown): CreatorSetupError {
  if (error instanceof CreatorWorkspaceRequestError) {
    return { message: error.message, ...(error.code === undefined ? {} : { code: error.code }),
      ...(error.details === undefined ? {} : { details: error.details }) };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

function CreatorWorkbenchContent({ children, previewWorkspaceId, layout = "workbench" }: CreatorWorkbenchProps) {
  const localeMessages = useAgentUILocale();
  const localeMessagesRef = useLocaleMessagesRef(localeMessages);
  localeMessagesRef.current = localeMessages;
  const creatorDebug = resolveCreatorDebugMode({
    hostname: window.location.hostname,
    search: window.location.search,
  });
  const [initialConversation] = useState(emptyConversation);
  const [items, setItems] = useState<CreatorConversationItem[]>(
    initialConversation.items,
  );
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [mockPanelOpen, setMockPanelOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [threadId, setThreadId] = useState(initialConversation.threadId);
  const [workspaceState, setWorkspaceState] = useState<CreatorWorkspacePublicState | null>(null);
  const [workspacePath, setWorkspacePath] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);
  const [undoRunId, setUndoRunId] = useState<string | null>(null);
  const [updateCheckRequest, setUpdateCheckRequest] = useState(0);
  const [updatePageOpen, setUpdatePageOpen] = useState(false);
  const handleUpdatePageChange = useCallback((open: boolean) => {
    setUpdatePageOpen(open);
    if (open) setMockPanelOpen(false);
  }, []);
  const [updateNotificationTarget, setUpdateNotificationTarget] = useState<HTMLDivElement | null>(null);
  const [reapplyRunId, setReapplyRunId] = useState<string | null>(null);
  const [runAccepted, setRunAccepted] = useState(false);
  const [workspacePicking, setWorkspacePicking] = useState(false);
  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(true);
  const [setupInfo, setSetupInfo] = useState<CreatorSetupInfoState>({ status: "idle" });
  const [setupDraft, setSetupDraft] = useState<CreatorSetupDraft>(createEmptyCreatorSetupDraft);
  const [setupValidationEpoch, setSetupValidationEpoch] = useState(0);
  const [setupNeedsRefresh, setSetupNeedsRefresh] = useState(false);
  const messageList = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const workspaceControl = useRef<HTMLDivElement>(null);
  const resizeStart = useRef<{
    pointerId: number;
    x: number;
    width: number;
  } | null>(null);
  const itemsRef = useRef(items);
  const agentRef = useRef<CreatorAgentClient | null>(null);
  const runInFlightRef = useRef(false);
  const workspaceIdRef = useRef<string | undefined>(undefined);
  const commandState = useCreatorCommandState(input, workspaceState?.status === "ready" ? workspaceState.workspace.id : undefined);
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandPreviewRevision, setCommandPreviewRevision] = useState(0);
  const commandInFlight = useRef(false);

  const sessionRef = useRef(0);
  const setupValidationRef = useRef<{ generation: number; controller: AbortController | undefined }>({ generation: 0, controller: undefined });
  const setupInfoRef = useRef<{ generation: number; controller: AbortController | undefined }>({ generation: 0, controller: undefined });
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

  const updateItems = (
    updater: (current: CreatorConversationItem[]) => CreatorConversationItem[],
  ) => {
    const next = updater(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  };

  const installWorkspace = (next: CreatorWorkspacePublicState) => {
    sessionRef.current += 1;
    agentRef.current?.abort();
    const oldId = workspaceIdRef.current;
    if (oldId !== undefined && agentRef.current !== null) {
      saveConversation(agentRef.current, itemsRef.current, oldId);
    }
    const id = next.status === "none" ? undefined : next.workspace.id;
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
    agentRef.current = (next.status === "ready") && next.runtime.status === "ready"
      ? new CreatorAgentClient(id!, conversation.threadId, conversation.agentMessages)
      : null;
    itemsRef.current = conversation.items;
    setItems(conversation.items);
    setThreadId(conversation.threadId);
    setInput("");
    setIsRunning(false);
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
            } catch (error) {
              rememberWorkspacePath(null);
              if (active) setWorkspaceError(error instanceof Error ? error.message : String(error));
            }
          }
        }
        if (active) {
          installWorkspace(state);
          setShowWorkspaceSelector(state.status === "none");
        }
      } catch (error) {
        if (active) setWorkspaceError(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) setWorkspaceBusy(false);
      }
    };
    void loadWorkspace();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!showWorkspaceSelector) return;
    const closeOnOutsideClick = (event: globalThis.PointerEvent) => {
      if (!workspaceControl.current?.contains(event.target as Node)) setShowWorkspaceSelector(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowWorkspaceSelector(false);
        workspaceControl.current?.querySelector<HTMLButtonElement>(".creator-workspace-trigger")?.focus();
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

  const loadSetupInfo = (workspaceId: string) => {
    invalidateSetupInfo();
    const generation = setupInfoRef.current.generation;
    const controller = new AbortController();
    setupInfoRef.current.controller = controller;
    setSetupInfo({ status: "loading" });
    void getWorkspaceSetup(controller.signal, localeMessages).then((info) => {
      if (!isSetupRequestCurrent({ requestGeneration: generation, currentGeneration: setupInfoRef.current.generation,
        requestWorkspaceId: workspaceId, currentWorkspaceId: workspaceIdRef.current, aborted: controller.signal.aborted })) return;
      setSetupInfo({ status: "ready", info });
      setSetupDraft({ ...createEmptyCreatorSetupDraft(), sourceRoot: info.suggestedSourceRoot });
    }).catch((error: unknown) => {
      if (!isSetupRequestCurrent({ requestGeneration: generation, currentGeneration: setupInfoRef.current.generation,
        requestWorkspaceId: workspaceId, currentWorkspaceId: workspaceIdRef.current, aborted: controller.signal.aborted })) return;
      setSetupInfo({ status: "failed", error: error instanceof Error ? error.message : String(error) });
    });
  };

  useEffect(() => {
    if (setupWorkspaceId === undefined) return;
    loadSetupInfo(setupWorkspaceId);
    return () => {
      invalidateSetupInfo();
      invalidateSetupValidation();
    };
  }, [setupWorkspaceId]);

  useEffect(() => {
    if (setupWorkspaceId === undefined || workspaceBusy || setupInfo.status !== "ready" ||
        setupDraft.mode === null || setupDraft.sourceRoot.trim() === "") return;
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
          requestWorkspaceId: workspaceId, currentWorkspaceId: workspaceIdRef.current, aborted: controller.signal.aborted })) return;
        setSetupDraft((current) => ({ ...current, validation: {
          status: isCreatorSetupValidationUsable(result) ? "valid" : "invalid",
          result,
        } }));
      }).catch((error: unknown) => {
        if (!isSetupRequestCurrent({ requestGeneration: generation, currentGeneration: setupValidationRef.current.generation,
          requestWorkspaceId: workspaceId, currentWorkspaceId: workspaceIdRef.current, aborted: controller.signal.aborted })) return;
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

  useEffect(
    () => () => {
      agentRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const start = resizeStart.current;
      if (start === null || start.pointerId !== event.pointerId) {
        return;
      }
      setPanelWidth(
        clampCreatorPanelWidth(start.width + start.x - event.clientX),
      );
    };
    const finishResize = () => {
      resizeStart.current = null;
      setIsResizing(false);
    };
    const handlePointerEnd = (event: PointerEvent) => {
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

  const executeSlashCommand = async (request: string) => {
    const parsed = parseCreatorCommand(request);
    if (parsed.kind !== "command") return;
    if (commandInFlight.current || isRunning || runInFlightRef.current || workspaceBusy || undoRunId || reapplyRunId || hasPendingCreatorQuestion(itemsRef.current) || workspaceState?.status !== "ready") return;
    if (parsed.id === "" || (["theme", "install"].includes(parsed.id) && parsed.args.length === 0)) { setInput(parsed.id === "" ? "/" : `/${parsed.id} `); commandState.show(); return; }
    const activity: CreatorCommandActivity = { kind: "command", id: crypto.randomUUID(), commandId: parsed.id, status: "running", ...(parsed.args[0] ? { value: parsed.args[0] } : {}) };
    const fail = (error: string) => updateItems(current => current.map(item => item.id === activity.id ? { ...activity, status: "failed", error } : item));
    if (!["theme", "install", "sync"].includes(parsed.id)) { updateItems(current => [...current, activity]); fail(formatLocaleMessage(localeMessages.commands.unknownCommand, parsed.id)); return; }
    if (parsed.id === "install") {
      const option = commandState.catalog.commands.find(command => command.id === "install")?.options.find(option => option.id === parsed.args.join(" "));
      if (!option) { commandState.show(); return; }
      if (option.disabled) return;
    }
    updateItems(current => [...current, activity]);
    if (parsed.args.length !== (parsed.id === "sync" ? 0 : 1)) { fail(localeMessages.commands.chooseOption); return; }
    commandInFlight.current = true; setCommandBusy(true);
    const session = sessionRef.current;
    const id = workspaceState.workspace.id;
    try {
      const result = await executeCreatorCommand(id, parsed.id === "theme" ? { id: "theme", args: { theme: parsed.args[0]! } } : parsed.id === "install" ? { id: "install", args: { resourceId: parsed.args[0]! } } : { id: "sync", args: {} }, localeMessages);
      if (session !== sessionRef.current) return;
      updateItems(current => current.map(item => item.id === activity.id ? { ...activity, ...(result.value ? { value: result.value } : {}), ...(result.reenabled ? { reenabled: true } : {}), status: "completed", receipt: result.receipt } : item));
      setInput("");
      if (result.changed) {
        const refreshed = await refreshWorkspaceProject(localeMessages).catch(() => undefined);
        if (session === sessionRef.current) { if (refreshed) setWorkspaceState(refreshed); setCommandPreviewRevision(value => value + 1); }
      }
    } catch (error) {
      if (session === sessionRef.current) {
        const code = error instanceof Error && "code" in error ? error.code : undefined;
        fail(code === "UNKNOWN_THEME" ? formatLocaleMessage(localeMessages.commands.unknownTheme, parsed.args[0]) : code === "CREATOR_COMMAND_BUSY" ? localeMessages.commands.busy : parsed.id === "install" ? formatLocaleMessage(localeMessages.commands.installFailed, commandState.optionLabel("install", parsed.args[0] ?? "")) : parsed.id === "sync" ? localeMessages.commands.syncFailed : localeMessages.commands.failed);
      }
    } finally {
      commandInFlight.current = false; setCommandBusy(false);
      if (session === sessionRef.current) void commandState.refresh();
    }
  };

  const submit = async (event?: FormEvent<HTMLFormElement>, response?: { question: CreatorQuestionActivity; answers: Record<string, string[]> }, requestOverride?: string) => {
    event?.preventDefault();
    const request = (requestOverride ?? input).trim();
    if (response === undefined && parseCreatorCommand(request).kind === "command") { await executeSlashCommand(request); return; }
    if (commandInFlight.current) return;
    if ((response === undefined && (request === "" || hasPendingCreatorQuestion(itemsRef.current))) ||
      isRunning || runInFlightRef.current || !((workspaceState?.status === "ready") && workspaceState.runtime.status === "ready")) {
      return;
    }
    if (response !== undefined && !itemsRef.current.some(item => item.kind === "question" && item.id === response.question.id && item.status === "pending")) return;
    const agent = agentRef.current;
    if (agent === null) {
      return;
    }
    const runSession = sessionRef.current;
    const runWorkspaceId = workspaceIdRef.current;
    if (runWorkspaceId === undefined) return;
    runInFlightRef.current = true;
    const updateRunItems = (updater: (current: CreatorConversationItem[]) => CreatorConversationItem[]) => {
      if (sessionRef.current === runSession) updateItems(updater);
    };

    if (response === undefined) setInput("");
    setIsRunning(true);
    setRunAccepted(false);
    if (response === undefined) {
      const userMessageId = crypto.randomUUID();
      updateItems((current) => [...current, { kind: "message", id: userMessageId, role: "user", content: request }]);
      agent.addMessage({ id: userMessageId, role: "user", content: request });
    } else {
      updateItems(current => current.map(item => item.kind === "question" && item.id === response.question.id
        ? { ...item, status: "submitting" as const, answers: response.answers } : item));
    }
    let latestAssistantMessageId: string | undefined;
    let runErrorHandled = false;
    let runErrorCode: string | undefined;

    const projectStep = (
      kind: "started" | "finished",
      event: { stepName: string; metadata?: unknown },
    ) => {
      if (!creatorStageNames.includes(event.stepName as CreatorStageName)) {
        return;
      }
      updateRunItems((current) => {
        const stageIndex = [...current]
          .map((item, index) => ({ item, index }))
          .reverse()
          .find(
            ({ item }) =>
              kind === "finished" &&
              item.kind === "stage" &&
              item.name === event.stepName &&
              item.status === "running",
          )?.index;
        const existing =
          stageIndex === undefined ? undefined : current[stageIndex];
        const projected = projectCreatorIntentStage(
          existing?.kind === "stage" ? existing : undefined,
          {
            kind,
            name: event.stepName,
            ...(kind === "started" && stageIndex === undefined
              ? { id: crypto.randomUUID() }
              : {}),
            metadata: event.metadata,
          },
        );
        if (projected === undefined) return current;
        if (stageIndex === undefined) return [...current, projected];
        return current.map((item, index) =>
          index === stageIndex ? projected : item,
        );
      });
    };

    try {
      const subscriber = {
        onRunStartedEvent() {
          setRunAccepted(true);
        },
        onQuestion(question: CreatorQuestionActivity) {
          updateRunItems(current => current.some(item => item.id === question.id) ? current : [...current, question]);
        },
        onTextMessageStartEvent({ event }) {
          latestAssistantMessageId = event.messageId;
          updateRunItems((current) =>
            current.some((item) => item.id === event.messageId)
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
                ],
          );
        },
        onTextMessageContentEvent({ event }) {
          updateRunItems((current) =>
            current.map((item) =>
              item.kind === "message" && item.id === event.messageId
                ? { ...item, content: `${item.content}${event.delta}` }
                : item,
            ),
          );
        },
        onTextMessageEndEvent({ event }) {
          updateRunItems((current) =>
            current.map((item) =>
              item.kind === "message" && item.id === event.messageId
                ? { ...item, streaming: false }
                : item,
            ),
          );
        },
        onToolCallStartEvent({ event }) {
          updateRunItems((current) =>
            current.some(
              (item) => item.kind === "tool" && item.id === event.toolCallId,
            )
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
                ],
          );
        },
        onToolCallArgsEvent({ event }) {
          updateRunItems((current) =>
            current.map((item) =>
              item.kind === "tool" && item.id === event.toolCallId
                ? item.name === "ask_user_question" && item.arguments === event.delta
                  ? item
                  : { ...item, arguments: `${item.arguments}${event.delta}` }
                : item,
            ),
          );
        },
        onToolCallEndEvent({ event }) {
          updateRunItems((current) =>
            current.map((item) =>
              item.kind === "tool" && item.id === event.toolCallId
                ? { ...item, status: "running" }
                : item,
            ),
          );
        },
        onToolCallResultEvent({ event }) {
          const metadata = isRecord(event.metadata) ? event.metadata : {};
          const failed =
            metadata.status === "error" || typeof metadata.error === "string";
          updateRunItems((current) =>
            current.map((item) =>
              item.kind === "tool" && item.id === event.toolCallId
                ? {
                    ...item,
                    result: event.content,
                    ...(typeof metadata.error === "string"
                      ? { error: metadata.error }
                      : {}),
                    status: failed ? "failed" : "completed",
                  }
                : item,
            ),
          );
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
          if (response !== undefined) {
            updateRunItems(current => current.map(item => item.kind === "question" && item.id === response.question.id
              ? { ...item, status: (questionContextIsGone(event.code) ? "stale" : "pending") as CreatorQuestionActivity["status"] } : item));
          }
          updateRunItems((current) => [
            ...current.map((item) =>
              item.kind === "message" && item.streaming === true
                ? { ...item, streaming: false }
                : item.kind === "tool" &&
                    (item.status === "preparing" || item.status === "running")
                ? { ...item, status: "failed" as const, error: event.message }
                : item.kind === "stage" && item.status === "running"
                  ? interruptCreatorStage(item, event.message, localeMessages)
                : item,
            ),
            {
              kind: "message",
              id: crypto.randomUUID(),
              role: "error",
              content: event.message,
            },
          ]);
        },
      } satisfies Parameters<CreatorAgentClient["run"]>[0];
      const result = response === undefined ? await agent.run(subscriber)
        : await agent.resumeInterrupt(response.question.interruptId, response.answers, subscriber);
      if (response !== undefined && !runErrorHandled) {
        updateRunItems(current => current.map(item => item.kind === "question" && item.id === response.question.id
          ? { ...item, status: "resolved" as const } : item));
      }
      updateRunItems((current) => {
        const stageItems = current.filter(
          (item): item is CreatorStageActivity => item.kind === "stage",
        );
        const reconciled = reconcileCreatorStagesFromRunResult(
          stageItems,
          result.result,
        );
        let stageIndex = 0;
        const next = current.map((item) => {
          if (item.kind !== "stage") return item;
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
        } else {
          const receiptMessageId = latestAssistantMessageId;
          updateRunItems((current) =>
            current.map((item) =>
              item.kind === "message" && item.id === receiptMessageId
                ? { ...item, receipt, streaming: false }
                : item,
            ),
          );
        }
      }
    } catch (error) {
      if (response !== undefined) {
        updateRunItems(current => current.map(item => item.kind === "question" && item.id === response.question.id
          ? { ...item, status: (questionContextIsGone(runErrorCode) ? "stale" : "pending") as CreatorQuestionActivity["status"] } : item));
      }
      if (!runErrorHandled) {
        const message = error instanceof Error ? error.message : String(error);
        updateRunItems((current) => [
          ...current.map((item) =>
            item.kind === "message" && item.streaming === true
              ? { ...item, streaming: false }
              : item.kind === "tool" &&
                  (item.status === "preparing" || item.status === "running")
                ? { ...item, status: "failed" as const, error: message }
                : item.kind === "stage" && item.status === "running"
                  ? interruptCreatorStage(item, message, localeMessages)
                : item,
          ),
          {
            kind: "message",
            id: crypto.randomUUID(),
            role: "error",
            content: message,
          },
        ]);
      }
    } finally {
      runInFlightRef.current = false;
      if (sessionRef.current === runSession) {
        saveConversation(agent, itemsRef.current, runWorkspaceId);
        setIsRunning(false);
        setRunAccepted(false);
        setStopBusy(false);
      }
    }
  };

  const stopCurrentRun = async () => {
    const agent = agentRef.current;
    if (agent === null || !isRunning || !runAccepted || stopBusy) return;
    setStopBusy(true);
    try {
      await agent.control("stop");
    } catch (error) {
      setStopBusy(false);
      updateItems(current => [...current, { kind: "message", id: crypto.randomUUID(), role: "error",
        content: error instanceof Error ? error.message : String(error) }]);
    }
  };

  const abandonQuestion = async (question: CreatorQuestionActivity) => {
    const agent = agentRef.current;
    if (agent === null || isRunning || question.status !== "pending") return;
    try {
      await agent.control("abandon", question.interruptId);
      updateItems(current => [...current.map(item => item.kind === "question" && item.id === question.id
        ? { ...item, status: "stale" as const } : item),
        { kind: "message", id: crypto.randomUUID(), role: "assistant",
          content: localeMessages.creatorWorkbench.thisDevelopmentTaskWasAbandonedPreviouslyCommittedChanges }]);
    } catch (error) {
      updateItems(current => [...current, { kind: "message", id: crypto.randomUUID(), role: "error",
        content: error instanceof Error ? error.message : String(error) }]);
    }
  };

  const undoCreatorRun = async (runId: string) => {
    const agent = agentRef.current;
    if (agent === null || commandInFlight.current || isRunning || undoRunId !== null || reapplyRunId !== null || hasPendingCreatorQuestion(itemsRef.current)) return;
    setUndoRunId(runId);
    try {
      const { reapplyable } = await agent.undo(runId);
      updateItems(current => current.map(item => (item.kind === "message" || item.kind === "command") && item.receipt?.transaction?.runId === runId
        ? { ...item, receipt: { ...item.receipt, transaction: { ...item.receipt.transaction, undoable: false, undone: true, reapplyable, reapplied: false } } }
        : item));
      setSetupValidationEpoch(current => current + 1);
    } catch (error) {
      updateItems(current => [...current, { kind: "message", id: crypto.randomUUID(), role: "error",
        content: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setUndoRunId(null);
    }
  };

  const reapplyCreatorRun = async (runId: string) => {
    const agent = agentRef.current;
    if (agent === null || commandInFlight.current || isRunning || undoRunId !== null || reapplyRunId !== null || hasPendingCreatorQuestion(itemsRef.current)) return;
    setReapplyRunId(runId);
    try {
      await agent.reapply(runId);
      updateItems(current => current.map(item => (item.kind === "message" || item.kind === "command") && item.receipt?.transaction?.runId === runId
        ? { ...item, receipt: { ...item.receipt, transaction: { ...item.receipt.transaction, undoable: true, undone: false, reapplied: true } } }
        : item));
      setSetupValidationEpoch(current => current + 1);
    } catch (error) {
      updateItems(current => [...current, { kind: "message", id: crypto.randomUUID(), role: "error",
        content: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setReapplyRunId(null);
    }
  };

  const clearConversation = () => {
    if (commandInFlight.current || isRunning || hasPendingCreatorQuestion(itemsRef.current) ||
      !((workspaceState?.status === "ready") && workspaceState.runtime.status === "ready")) {
      return;
    }
    const nextThreadId = crypto.randomUUID();
    const agent = new CreatorAgentClient(workspaceIdRef.current!, nextThreadId);
    agentRef.current = agent;
    itemsRef.current = [];
    setItems([]);
    setInput("");
    setThreadId(nextThreadId);
    if (workspaceIdRef.current !== undefined) saveConversation(agent, [], workspaceIdRef.current);
  };

  const selectWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (workspaceBusy || initializingRef.current || workspacePath.trim() === "" || hasPendingCreatorQuestion(itemsRef.current)) return;
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      installWorkspace(await selectWorkspaceProject(workspacePath.trim(), localeMessages));
      setShowWorkspaceSelector(false);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const chooseWorkspace = async () => {
    if (workspaceState === null || workspaceBusy || initializingRef.current || hasPendingCreatorQuestion(itemsRef.current)) return;
    setWorkspaceBusy(true);
    setWorkspacePicking(true);
    setWorkspaceError(null);
    try {
      const result = await chooseWorkspaceProject(localeMessages);
      if (result.status === "cancelled") return;
      if (result.status === "none") throw new Error(localeMessages.creatorWorkbench.noProjectFolderSelected);
      installWorkspace(result);
      setWorkspacePath(result.workspace.displayPath);
      setShowWorkspaceSelector(false);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspacePicking(false);
      setWorkspaceBusy(false);
    }
  };

  const clearWorkspace = async () => {
    if (workspaceBusy || initializingRef.current || hasPendingCreatorQuestion(itemsRef.current)) return;
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    sessionRef.current += 1;
    agentRef.current?.abort();
    try {
      installWorkspace(await clearWorkspaceProject(localeMessages));
      setWorkspacePath("");
      setShowWorkspaceSelector(true);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const refreshWorkspace = async () => {
    if (workspaceBusy || initializingRef.current || hasPendingCreatorQuestion(itemsRef.current)) return;
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
      if (refreshed.status === "uninitialized") setSetupValidationEpoch((current) => current + 1);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
      if (workspaceState?.status === "uninitialized") setSetupValidationEpoch((current) => current + 1);
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const changeSetupMode = (mode: CreatorProjectMode) => {
    if (initializingRef.current || workspaceState?.status !== "uninitialized") return;
    invalidateSetupValidation();
    setSetupDraft((current) => ({ ...current, mode, validation: { status: "idle" },
      error: setupNeedsRefresh ? current.error : null }));
  };

  const changeSetupSourceRoot = (sourceRoot: string) => {
    if (initializingRef.current || workspaceState?.status !== "uninitialized") return;
    invalidateSetupValidation();
    setSetupDraft((current) => ({ ...current, sourceRoot, validation: { status: "idle" },
      error: setupNeedsRefresh ? current.error : null }));
  };

  const canInitialize = canInitializeCreatorProject({
    workspaceStatus: workspaceState?.status ?? null, draft: setupDraft, workspaceBusy, setupNeedsRefresh,
  });

  const initializeWorkspaceProject = async () => {
    if (!canInitialize || initializingRef.current || setupDraft.mode === null) return;
    const workspaceId = workspaceIdRef.current;
    if (workspaceId === undefined) return;
    initializingRef.current = true;
    setSetupDraft((current) => ({ ...current, initializing: true, error: null }));
    try {
      const result = await initializeWorkspaceProjectRequest({
        mode: setupDraft.mode,
        sourceRoot: setupDraft.sourceRoot,
      }, localeMessages);
      if (workspaceIdRef.current === workspaceId) {
        installWorkspace(result);
        if (result.status === "uninitialized") {
          setSetupNeedsRefresh(true);
          setSetupDraft((current) => ({ ...current, validation: { status: "idle" },
            error: { message: localeMessages.creatorWorkbench.initializationDidNotReportAReadyStateRefresh } }));
        }
      }
    } catch (error) {
      if (workspaceIdRef.current !== workspaceId) return;
      if (shouldRefreshAfterInitializeError(error)) {
        setSetupNeedsRefresh(true);
        try {
          const refreshed = await refreshWorkspaceProject(localeMessages);
          if (workspaceIdRef.current !== workspaceId) return;
          installWorkspace(refreshed);
          if (refreshed.status === "uninitialized") {
            setSetupDraft((current) => ({ ...current, validation: { status: "idle" },
              error: { message: localeMessages.creatorWorkbench.initializationOutcomeUnconfirmedRefreshProjectStateAndRetry, ...(error.code === undefined ? {} : { code: error.code }) } }));
          }
        } catch (refreshError) {
          if (workspaceIdRef.current === workspaceId) {
            setSetupDraft((current) => ({ ...current, validation: { status: "idle" },
              error: { message: formatLocaleMessage(localeMessages.creatorWorkbench.initializationOutcomeUnconfirmedCouldNotRefreshProjectState, setupError(refreshError).message), ...(error.code === undefined ? {} : { code: error.code }) } }));
          }
        }
      } else {
        setSetupDraft((current) => ({ ...current, error: setupError(error) }));
      }
    } finally {
      initializingRef.current = false;
      if (workspaceIdRef.current === workspaceId) {
        setSetupDraft((current) => ({ ...current, initializing: false }));
      }
    }
  };

  const applyCommandSelection = (choice: { input?: string; execute?: string; handled?: boolean }) => {
    if (choice.input !== undefined) setInput(choice.input);
    else if (choice.execute !== undefined) void executeSlashCommand(choice.execute);
  };
  const pickCommand = (id: string) => applyCommandSelection(commandState.pick(id));
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const selection = commandState.keyDown(event);
    if (selection?.handled) {
      applyCommandSelection(selection);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
      event.preventDefault();
      void submit();
    }
  };

  const startPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
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

  const resizePanelWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const currentWidth =
      panelWidth ?? panel.current?.getBoundingClientRect().width;
    if (currentWidth === undefined) {
      return;
    }
    const direction = event.key === "ArrowLeft" ? 1 : -1;
    setPanelWidth(
      clampCreatorPanelWidth(
        currentWidth + direction * CREATOR_PANEL_KEYBOARD_STEP,
      ),
    );
  };

  const creatorRuntimeReady = (workspaceState?.status === "ready") && workspaceState.runtime.status === "ready";
  const questionPending = hasPendingCreatorQuestion(items);
  const pendingQuestionHint = localeMessages.creatorWorkbench.answerTheCurrentQuestionFirst;

  return (
    <div
      className="creator-workbench"
      data-creator-layout={layout}
      data-creator-panel-open={isOpen}
      data-creator-mock-open={mockPanelOpen}
      data-creator-panel-resizing={isResizing}
      style={
        panelWidth === null
          ? undefined
          : ({
              "--creator-panel-width": `${panelWidth}px`,
            } as CSSProperties)
      }
    >
      {layout === "dock" ? null : workspaceState !== null && (workspaceState.status === "ready") && workspaceState.workspace.id === previewWorkspaceId ? (
        <CreatorWorkbenchPreview key={commandPreviewRevision} threadId={threadId} workspaceId={workspaceState.workspace.id}>{children}</CreatorWorkbenchPreview>
      ) : (
        <section className="creator-workbench-preview creator-workbench-preview-placeholder" aria-label={localeMessages.creatorWorkbench.projectPreview}>
          {workspaceState?.status === "uninitialized" ? (
            <><strong>{localeMessages.creatorWorkbench.agentUIIsNotInitialized}</strong><p>{localeMessages.creatorWorkbench.chooseAProductModeAndInitializeAgentUI}</p></>
          ) : workspaceState === null || workspaceState.status === "none" ? (
            <strong>{localeMessages.creatorWorkbench.selectAProjectFirst}</strong>
          ) : (
            <><strong>{localeMessages.creatorWorkbench.openYourProjectSDevelopmentPage}</strong><p>{localeMessages.creatorWorkbench.yourProjectSDevelopmentServerRendersThePage}</p></>
          )}
        </section>
      )}

      {isOpen ? (
        <aside className="creator-panel creator-ui-scope" aria-label={localeMessages.creatorWorkbench.creator} ref={panel}>
          {layout === "dock" ? null : <div
            aria-label={localeMessages.creatorWorkbench.resizeCreatorPanel}
            aria-orientation="vertical"
            className="creator-panel-resizer"
            onDoubleClick={() => setPanelWidth(null)}
            onKeyDown={resizePanelWithKeyboard}
            onPointerDown={startPanelResize}
            role="separator"
            tabIndex={0}
            title={localeMessages.creatorWorkbench.dragToResizeDoubleClickToRestoreThe}
          />}
          <header className="creator-panel-header">
            <div className="creator-panel-brand" title={localeMessages.creatorWorkbench.creatorDevelopmentOnly}>
              <div className="creator-panel-brand-icon"><PanelsTopLeft aria-hidden="true" /></div>
              <h1>{localeMessages.creatorWorkbench.creator}</h1>
              <div className="creator-header-updates" ref={setUpdateNotificationTarget} />
            </div>
            <div className="creator-panel-header-actions creator-ui-scope">
              <Button variant="secondary" size="sm"
                className="creator-header-mock"
                data-creator-mock-entry=""
                aria-controls="creator-mock-panel"
                aria-expanded={mockPanelOpen}
                aria-label={mockPanelOpen ? localeMessages.creatorWorkbench.closeMockAgentPanel : localeMessages.creatorWorkbench.openMockAgentPanel}
                onClick={() => { setMockPanelOpen((open) => !open); setUpdatePageOpen(false); }}
                type="button"
              >
                <span className="creator-mock-label">Mock<span className="creator-mock-label-suffix"> Agent</span></span>
                <ChevronDown aria-hidden="true" className={mockPanelOpen ? "cui:rotate-180" : undefined} />
              </Button>
              <div
                className="creator-panel-dev-studio-dock"
                data-slot="agent-ui-dev-studio-dock"
              />
              {layout === "dock" ? null : <Button variant="ghost" size="icon-sm"
                aria-label={localeMessages.creatorWorkbench.closeCreatorPanel}
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </Button>}
              {workspaceState?.status === "ready" ? <CreatorSettings onAgent={() => setAgentPanelOpen(value => !value)} busy={isRunning || questionPending} onCheckUpdates={() => setUpdateCheckRequest(value => value + 1)} /> : null}
            </div>
          </header>

          <div className="creator-panel-body">
            {workspaceState?.status === "ready" ? <CreatorPluginUpdates key={workspaceState.workspace.id} workspaceId={workspaceState.workspace.id} busy={isRunning || questionPending} modelReady={creatorRuntimeReady} checkRequest={updateCheckRequest} notificationTarget={updateNotificationTarget} pageOpen={updatePageOpen} onPageChange={handleUpdatePageChange} onModelMerge={prompt => { void submit(undefined, undefined, prompt); }} /> : null}
            {workspaceState?.status === "ready" ? <AgentConnectionPanel key={workspaceState.workspace.id} workspaceId={workspaceState.workspace.id} visible={agentPanelOpen} /> : null}
            {mockPanelOpen ? <MockServicePanel {...(workspaceState && workspaceState.status !== "none" ? { projectId: workspaceState.workspace.id } : {})} /> : null}
            <div
              className="creator-panel-dev-studio-panel"
              data-slot="agent-ui-dev-studio-panel"
            />

            {workspaceState?.status === "uninitialized" ? (
              <CreatorProjectSetup infoState={setupInfo} draft={setupDraft} canInitialize={canInitialize}
                debug={creatorDebug} onModeChange={changeSetupMode} onSourceRootChange={changeSetupSourceRoot}
                onInitialize={() => void initializeWorkspaceProject()}
                onRetryInfo={() => { if (setupWorkspaceId !== undefined) loadSetupInfo(setupWorkspaceId); }} />
            ) : <div className="creator-panel-messages" ref={messageList} style={updatePageOpen ? { display: "none" } : undefined}>
              {workspaceState?.status === "ready" ? (
                <CreatorProjectIntegrationGuide key={workspaceState.workspace.id} mode={workspaceState.project.mode}
                  sourceRoot={workspaceState.project.sourceRoot} />
              ) : null}
              {workspaceState?.status === "broken" ? (
                <div className="creator-panel-empty creator-panel-empty--error"><AlertCircle aria-hidden="true" /><strong>{localeMessages.creatorWorkbench.projectConfigurationNeedsRepair}</strong>{workspaceState.issues.map((issue) => <p key={issue.code}>{issue.message}</p>)}
                  <Button size="sm" variant="outline" type="button" disabled={workspaceBusy} onClick={() => void refreshWorkspace()}><RefreshCw aria-hidden="true" />{localeMessages.creatorWorkbench.recheckProject}</Button>
                  <details><summary>{localeMessages.creatorWorkbench.viewTechnicalDetails}</summary>{workspaceState.issues.map(issue => <code key={issue.code}>{issue.code}</code>)}</details>
                </div>
              ) : (workspaceState?.status === "ready") && workspaceState.runtime.status === "unavailable" ? (
                <div className="creator-panel-empty creator-panel-empty--error"><AlertCircle aria-hidden="true" /><strong>{localeMessages.creatorWorkbench.creatorServiceTemporarilyUnavailable}</strong><p>{workspaceState.runtime.message}</p>
                  <Button size="sm" variant="outline" type="button" disabled={workspaceBusy} onClick={() => void refreshWorkspace()}><RefreshCw aria-hidden="true" />{localeMessages.creatorWorkbench.reconnect}</Button>
                  <details><summary>{localeMessages.creatorWorkbench.viewTechnicalDetails}</summary><code>{workspaceState.runtime.code}</code></details>
                </div>
              ) : workspaceState?.status !== "ready" ? (
                <div className="creator-panel-empty"><FolderOpen aria-hidden="true" /><strong>{workspaceState === null ? localeMessages.creatorWorkbench.readingProject : localeMessages.creatorWorkbench.startWithYourFrontendProject}</strong><p>{localeMessages.creatorWorkbench.chooseAProjectThenDescribeTheAgentUI}</p></div>
              ) : items.filter(
                (item) => item.kind !== "stage" || shouldPresentStage(item, creatorDebug),
              ).length === 0 ? (
                <div className="creator-panel-empty">
                  <Sparkles aria-hidden="true" />
                  <strong>{localeMessages.creatorWorkbench.tellCreatorWhatYouWantToUnderstandInspect}</strong>
                  <p>{localeMessages.creatorWorkbench.analyzeTheCurrentAgentUIDesignAChange}</p>
                </div>
              ) : (
                presentConversationItems(items, creatorDebug).map((item) =>
                  item.kind === "command" ? (
                    <article className="creator-panel-message creator-command-activity" key={item.id} role="status">
                      <p>{item.status === "failed" ? localizeCreatorPresentation(item.error, localeMessages) ?? localeMessages.commands.failed : item.commandId === "sync" ? (item.status === "running" ? localeMessages.commands.syncing : item.receipt?.verification?.status === "no-project-change" ? localeMessages.commands.alreadySynced : localeMessages.commands.synced) : formatLocaleMessage(item.commandId === "install" ? (item.status === "running" ? localeMessages.commands.installing : item.reenabled ? localeMessages.commands.reenabled : localeMessages.commands.installed) : item.status === "running" ? localeMessages.commands.running : localeMessages.commands.completed, commandState.optionLabel(item.commandId, item.value ?? ""))}</p>
                      {item.receipt ? <CreatorRunReceiptPresentation receipt={item.receipt} debug={creatorDebug}
                        onUndo={!commandBusy && !isRunning && !questionPending ? runId => { void undoCreatorRun(runId); } : undefined}
                        onReapply={!commandBusy && !isRunning && !questionPending ? runId => { void reapplyCreatorRun(runId); } : undefined}
                        undoBusy={undoRunId === item.receipt.transaction?.runId} reapplyBusy={reapplyRunId === item.receipt.transaction?.runId} /> : null}
                    </article>
                  ) : item.kind === "stage" ? (

                    <CreatorStageActivityCard
                      activity={item}
                      debug={creatorDebug}
                      key={item.id}
                    />
                  ) : item.kind === "tool-group" ? (
                    <CreatorToolGroupCard activities={item.activities} key={item.id} />
                  ) : item.kind === "question" ? (
                    <CreatorQuestionCard activity={item} key={item.id}
                      onAnswer={answers => { void submit(undefined, { question: item, answers }); }}
                      onAbandon={() => { void abandonQuestion(item); }} />
                  ) : (
                    <article
                      className={`creator-panel-message creator-panel-message--${item.role}`}
                      key={item.id}
                    >
                      <div className="creator-message-meta">
                        {item.role === "assistant" ? <Bot aria-hidden="true" /> : item.role === "user" ? <UserRound aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
                        <span>{getRoleLabels(localeMessages)[item.role]}</span>
                      </div>
                      {item.role === "assistant" ? (
                        <CreatorMarkdown content={item.content} />
                      ) : (
                        <p>{item.content}</p>
                      )}
                      {item.streaming === true ? (
                        <span
                          className="creator-stream-cursor"
                          aria-hidden="true"
                        />
                      ) : null}
                      {item.receipt === undefined ? null : (
                        <CreatorRunReceiptPresentation receipt={item.receipt} debug={creatorDebug}
                          onUndo={!commandBusy && !isRunning && !hasPendingCreatorQuestion(items) ? (runId) => { void undoCreatorRun(runId); } : undefined}
                          onReapply={!commandBusy && !isRunning && !hasPendingCreatorQuestion(items) ? (runId) => { void reapplyCreatorRun(runId); } : undefined}
                          undoBusy={undoRunId === item.receipt.transaction?.runId}
                          reapplyBusy={reapplyRunId === item.receipt.transaction?.runId} />
                      )}
                    </article>
                  ),
                )
              )}
              {isRunning ? (
                <p className="creator-panel-running" role="status">

                  {localeMessages.creatorWorkbench.creatorIsProcessingYourRequest}
                </p>
              ) : null}
            </div>}
          </div>

          <div className="creator-panel-footer">
            <div className="creator-workspace-control" ref={workspaceControl}>
              <Button size="sm" variant="outline"
                aria-controls="creator-workspace-menu"
                aria-expanded={showWorkspaceSelector}
                aria-label={workspaceState !== null && workspaceState.status !== "none"
                  ? formatLocaleMessage(localeMessages.creatorWorkbench.currentProjectClickToSwitchProjects, workspaceState.workspace.name) : localeMessages.creatorWorkbench.chooseProjectFolder}
                className="creator-workspace-trigger"
                disabled={workspaceBusy || setupDraft.initializing || questionPending}
                onClick={() => {
                  if (workspaceState !== null && workspaceState.status !== "none") {
                    setWorkspacePath(workspaceState.workspace.displayPath);
                  }
                  setShowWorkspaceSelector((current) => !current);
                }}
                title={questionPending ? pendingQuestionHint : workspaceState !== null && workspaceState.status !== "none"
                  ? workspaceState.workspace.displayPath : localeMessages.creatorWorkbench.chooseProjectFolder}
                type="button"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3.5 6.5h6l2 2h9v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11Z" />
                  <path d="M3.5 10h17" />
                </svg>
                <span>{workspaceState !== null && workspaceState.status !== "none"
                  ? workspaceState.workspace.name : localeMessages.creatorWorkbench.selectProject}</span>
                {workspaceState !== null && (workspaceState.status === "ready") &&
                  workspaceState.warnings?.length ? <span aria-label={localeMessages.creatorWorkbench.projectHasNotices} className="creator-workspace-warning-dot">!</span> : null}
                <svg aria-hidden="true" className="creator-workspace-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </Button>
              {showWorkspaceSelector ? (
                <section className="creator-workspace-menu" id="creator-workspace-menu" aria-label={localeMessages.creatorWorkbench.chooseFrontendProjectFolder}>
                  <header className="creator-workspace-menu-header">
                    <h2>{localeMessages.creatorWorkbench.project}</h2>
                    <Button size="icon-xs" variant="ghost" type="button" aria-label={localeMessages.creatorWorkbench.closeProjectSelection} onClick={() => { setShowWorkspaceSelector(false); workspaceControl.current?.querySelector<HTMLButtonElement>(".creator-workspace-trigger")?.focus(); }}><X aria-hidden="true" /></Button>
                  </header>
                  {workspaceState !== null && workspaceState.status !== "none" ? (
                    <div className="creator-workspace-current">
                      <div className="creator-workspace-identity">
                        <FolderOpen aria-hidden="true" />
                        <strong title={workspaceState.workspace.name}>{workspaceState.workspace.name}</strong>
                        <Button size="icon-xs" variant="ghost" type="button" aria-label={localeMessages.creatorWorkbench.refreshProject} disabled={workspaceBusy || setupDraft.initializing || questionPending} title={questionPending ? pendingQuestionHint : localeMessages.creatorWorkbench.refreshProject} onClick={() => void refreshWorkspace()}><RefreshCw aria-hidden="true" className={workspaceBusy ? "creator-tool-group-spinner" : undefined} /></Button>
                      </div>
                      <div className="creator-workspace-metadata">
                        <Badge variant="secondary">{workspaceState.status === "ready" ? ({ assistant: localeMessages.creatorWorkbench.assistant, embedded: localeMessages.creatorWorkbench.embedded, platform: localeMessages.creatorWorkbench.workbench })[workspaceState.project.mode] : workspaceState.status === "uninitialized" ? localeMessages.creatorWorkbench.notInitialized2 : localeMessages.creatorWorkbench.configurationError}</Badge>
                        {workspaceState.status === "ready" ? <code title={workspaceState.project.sourceRoot}>{workspaceState.project.sourceRoot}</code> : null}
                      </div>
                      <details className="creator-workspace-info">
                        <summary>{localeMessages.creatorWorkbench.projectDetails}</summary>
                        <dl><dt>{localeMessages.creatorWorkbench.projectPath}</dt><dd><code>{workspaceState.workspace.displayPath}</code></dd></dl>
                        <Button size="xs" variant="ghost" type="button" disabled={workspaceBusy || setupDraft.initializing || questionPending} title={questionPending ? pendingQuestionHint : localeMessages.creatorWorkbench.deselectAndKeepProjectFiles} onClick={() => void clearWorkspace()}>{localeMessages.creatorWorkbench.deselectProject}</Button>
                      </details>
                      {(workspaceState.status === "ready") && workspaceState.warnings?.length ? (
                        <div className="creator-workspace-warnings" role="status">
                          <strong>{localeMessages.creatorWorkbench.agentUIInitializationNeedsRecoveryChecks}</strong>
                          {workspaceState.warnings.map((issue, index) => (
                            <span key={`${issue.code}-${index}`}>{issue.code === "AGENT_UI_INITIALIZATION_RECOVERY_REQUIRED"
                              ? localeMessages.creatorWorkbench.initializationWasCommittedButCleanupDidNotFinish
                              : setupIssueMessage(issue, localeMessages)}</span>
                          ))}
                        </div>
                      ) : null}

                    </div>
                  ) : null}
                  <div className="creator-workspace-selector">
                    <strong>{workspaceState !== null && workspaceState.status !== "none" ? localeMessages.creatorWorkbench.switchProject : localeMessages.creatorWorkbench.chooseFrontendProjectFolder}</strong>
                    <span>{localeMessages.creatorWorkbench.chooseAFrontendProjectCreatorWillCheckIts}</span>
                    <Button size="sm" variant="outline" className="creator-workspace-browse" type="button"
                      disabled={workspaceState === null || workspaceBusy || setupDraft.initializing || questionPending}
                      onClick={() => void chooseWorkspace()}>
                      <FolderOpen aria-hidden="true" />{workspacePicking ? localeMessages.creatorWorkbench.waitingForFolderSelection2 : localeMessages.creatorWorkbench.chooseProjectFolder}
                    </Button>
                    {workspacePicking ? <span role="status">{localeMessages.creatorWorkbench.chooseAProjectInTheSystemWindowOr}</span> : null}
                    <details>
                      <summary>{localeMessages.creatorWorkbench.enterProjectPathManually}</summary>
                      <form onSubmit={selectWorkspace}>
                        <label htmlFor="creator-workspace-path">{localeMessages.creatorWorkbench.absoluteProjectFolderPath}</label>
                        <Input id="creator-workspace-path" value={workspacePath} disabled={workspaceBusy || setupDraft.initializing || questionPending}
                          onChange={(event) => setWorkspacePath(event.target.value)} placeholder="/path/to/project" autoComplete="off" spellCheck={false} />
                        <Button size="sm" variant="secondary" type="submit" disabled={workspaceBusy || setupDraft.initializing || questionPending || workspacePath.trim() === ""}>{localeMessages.creatorWorkbench.useThisFolder}</Button>
                      </form>
                    </details>
                  </div>
                  {workspaceError === null ? null : <p role="alert">{localizeCreatorPresentation(workspaceError, localeMessages)}</p>}
                </section>
              ) : null}
            </div>
            {workspaceState?.status === "ready" ? <form className="creator-panel-composer" style={updatePageOpen ? { display: "none" } : undefined} onSubmit={submit}>
              <label htmlFor="creator-request">{localeMessages.creatorWorkbench.tellCreator}</label>
              {commandState.open && !commandBusy && !isRunning && !questionPending ? <CreatorCommandMenu items={commandState.items} active={commandState.active} title={commandState.title} notice={commandState.notice} onPick={pickCommand} onSelect={commandState.select} /> : null}
              <Textarea
                role="combobox"
                aria-expanded={commandState.open}
                aria-autocomplete="list"
                aria-controls={commandState.open ? "creator-command-menu" : undefined}
                aria-activedescendant={commandState.open && commandState.items.length ? `creator-command-option-${commandState.active}` : undefined}
                disabled={isRunning || commandBusy || questionPending}

                id="creator-request"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={localeMessages.creatorWorkbench.forExampleInspectTheUIOrAddA}
                rows={2}
                value={input}
              />
              <div>
                <Button variant="ghost" size="xs" className="creator-composer-clear"
                  aria-label={localeMessages.creatorWorkbench.clearCreatorConversation}
                  disabled={commandBusy || isRunning || !creatorRuntimeReady || questionPending}
                  onClick={clearConversation}
                  title={questionPending ? pendingQuestionHint : localeMessages.creatorWorkbench.clearTheConversationAndInputToStartAgain}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" />{localeMessages.creatorWorkbench.clearConversation}
                </Button>
                <small>{localeMessages.creatorWorkbench.enterToSendShiftEnterForANew}</small>
                {isRunning ? (
                  <Button size="sm" variant="outline" type="button" disabled={!runAccepted || stopBusy} onClick={() => void stopCurrentRun()}>
                    <Square aria-hidden="true" />{stopBusy ? localeMessages.creatorWorkbench.stopping : localeMessages.creatorWorkbench.stopExecution}
                  </Button>
                ) : (
                  <Button size="sm" disabled={commandBusy || input.trim() === "" || (commandState.parsed.kind === "text" && !creatorRuntimeReady) || items.some(item => item.kind === "question" && (item.status === "pending" || item.status === "submitting"))} type="submit">
                    <ArrowUp aria-hidden="true" />{localeMessages.creatorWorkbench.send}
                  </Button>
                )}
              </div>
            </form> : null}
          </div>
        </aside>
      ) : (
        <Button size="sm" variant="outline"
          aria-label={localeMessages.creatorWorkbench.openCreatorPanel}
          className="creator-panel-open"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          <span aria-hidden="true" className="creator-panel-open-dot" />
          <span>{localeMessages.creatorWorkbench.openCreator}</span>
          <span aria-hidden="true" className="creator-panel-open-chevron" />
        </Button>
      )}
    </div>
  );
}

export { CreatorLocaleProvider, useAgentUILocale } from "./i18n/locale.js";
export type { CreatorLocaleCode } from "./i18n/locale.js";
export function CreatorWorkbench(props: CreatorWorkbenchProps) {
  return <CreatorLocaleProvider locale={props.locale} onLocaleChange={props.onLocaleChange}><CreatorWorkbenchContent {...props} /></CreatorLocaleProvider>;
}
