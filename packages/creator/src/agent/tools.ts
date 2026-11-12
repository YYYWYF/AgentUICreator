import { readdir } from "node:fs/promises";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import { z } from "zod";
import { matchesGlob, regexSearch } from "./search.js";
import { defaultAgentMessages, type AgentMessages } from "./messages.js";
import { parseCreatorQuestion } from "./creatorInterruptTypes.js";
import { DebuggingEvidence } from "./debugging.js";
import { CreatorValidation } from "./validation.js";
import { isGraphInterrupt } from "@langchain/langgraph";
import { agentContracts } from "./contracts.js";
import { createPlugin, mutatePlugin } from "./source-tools.js";
import { prepareService, applyService } from "./service-tools.js";
import { prepareServiceImplementation, applyServiceImplementation } from "./service-implementation-tools.js";
import { inspectRuntime } from "./runtime-evidence.js";
import { addExtraTools } from "./extra-tools.js";
import { prepareCompositionApplications } from "./plugin-applications.js";
import { RunActivity, sourceRoot, walk, readTransaction, restoreTransaction } from "./activity.js";
import { operatorContracts, requestOperator } from "./operator.js";
import { readCreatorFileState as fileState, replaceCreatorFileAtomically, createCreatorFileAtomically, removeCreatorFile, CREATOR_MISSING_FILE_HASH, creatorContentHash } from "./files/creatorFileState.js";
import { logicalProjectPath as logical, resolveReadPath as readPath, readProjectFile } from "./project-read.js";
import { editContextInput, inspectEditingContext, rememberInspectedPlugin } from "./edit-context.js";
import { editingProjectIdentity, rememberProjectTargets, type EditingSelection, type EditingTarget } from "./editing-session.js";
import { inspectProject, pluginInspectionSummary, projectCheckIdentity, projectInspectionSummary, runtimeObservationNavigation } from "./inspection.js";
import { editReadLines } from "./line-edit.js";
import { checkCreatorPostconditions, creatorPostconditions, type CreatorPostcondition } from "./outcome.js";
import { assertExecutionOpen, assertInstanceRetention, cancelExecution } from "./execution-decision.js";
import { ToolRecovery, toolReadIdentity } from "./tool-recovery.js";
import { EvidenceProgress } from "./evidence-progress.js";
import { rememberPublicApiRead, projectPublicApiRead } from "./working-context.js";
import { readCreatorDocumentation } from "./documentation.js";
import { prepareDevelopment } from "./development-tools.js";
import { InvestigationState } from "./investigation-state.js";

export interface ToolContext {
  documentationRoot?: string;
  contextWindow?: import("./context-window.js").CreatorContextWindow;
  root: string; skills: string; contracts: string; activity: RunActivity;
  readOnly: boolean; userMessage: string; threadId: string; signal: AbortSignal;
  groups: Set<string>; authorizedPlugins: Set<string>;
  diagnostics: Map<string, any>; verificationMode: string;
  behaviorVerificationEnabled?: boolean;
  requestRuntimeObservation?: (request: { requestId: string; currentHash: string; currentHashes?: string[]; nodeIds?: string[]; instanceIds?: string[] }) => Promise<void>;
  runtimeObservationRefresh?: { key: string; pending: Promise<{ status: string; requestId: string }> };
  recovery?: ToolRecovery;
  cancelMarker?: string;
  executionDecision?: { status: "user_cancelled"; toolName: string };
  pluginNames?: { pluginId: string; name?: string; targetNames?: readonly string[] }[];
  validation?: CreatorValidation;
  messages?: AgentMessages;
  evidenceRevision?: number;
  evidenceProgress?: EvidenceProgress;
  requiredPostconditions?: CreatorPostcondition[];
  sourceConditionsFailed?: boolean;
  sourceVerification?: { status: string; revision: number; checked: number };
  staticVerification?: { status: string; revision: number; checks?: { command: string; status: string }[]; reusable?: boolean };
  investigation?: InvestigationState;
  sourceSnapshots?: Map<string, import("./working-context.js").SourceSnapshot>;
  publicApiSnapshots?: Map<string, import("./working-context.js").PublicApiSnapshot>;
  metrics?: { modelCalls: number; toolCalls: number };
  debugging?: DebuggingEvidence;
  blocker?: { code: string; message: string };
  toolObservations?: { toolName: string; status: string; reason?: string }[];
  pluginPlans?: Map<string, { scopeHash: string; contract: any; workKind: string; status: string; sourceOnly?: boolean }>;
  activePluginId?: string;
  behavior?: Map<string, any>;
  developmentDecision?: "adjust" | "defer";
  hostTools?: Map<string, (input: any) => any>;
  deliveries?: any[];
  readRanges?: Map<string, { hash: string; start: number; end: number }[]>;
  editingSelection?: EditingSelection;
  pluginOwnerships?: Map<string, { pluginId: string; entryPath?: string; assetOwnership?: string; implementationOwnership: "npm" | "project" | "unknown" }>;
  editingTargets?: { target: EditingTarget; identity: string; description?: string; intents?: string[]; relatedPluginIds?: string[] }[];
  noChangeOutcome?: { toolName: string; status: "already_current" | "declined"; identity: string; file?: { path: string; hash: string }; metadataOnly?: boolean; postconditions?: CreatorPostcondition[] };
}
const READ_TOOLS = new Set(["verify_creator_outcome", "ls", "glob", "grep", "read_file", "read_creator_context", "read_creator_documentation", "ask_user_question", "inspect_ui_edit_context", "inspect_ui_project", "inspect_app_ui_model", "inspect_ui_plugin", "inspect_ui_capabilities", "enable_creator_tools", "inspect_static_diagnostics", "inspect_runtime_errors", "inspect_runtime_layout", "inspect_creator_transactions", "inspect_creator_transaction"]);
const CORE = new Set(["prepare_ui_plugin_development", "verify_creator_outcome", "ls", "glob", "grep", "read_file", "read_creator_context", "read_creator_documentation", "edit_file", "edit_file_from_read", "create_ui_source_file", "delete_ui_source_file", "ask_user_question", "inspect_ui_edit_context", "inspect_ui_project", "inspect_app_ui_model", "inspect_ui_plugin", "inspect_ui_capabilities", "validate_creator_changes", "enable_creator_tools"]);
export const TOOL_GROUPS: Record<string, string[]> = {
  composition: ["inspect_ui_slots", "preflight_ui_plugin_placement", "mutate_app_ui_model", "inspect_app_ui_model_source", "repair_app_ui_model", "purge_ui_plugin"],
  plugin_authoring: ["list_ui_plugins", "inspect_agent_ui_sources", "apply_agent_ui_source_item", "inspect_ui_plugin_source_references", "prepare_ui_plugin_development", "create_ui_plugin", "create_custom_plugin", "takeover_plugin_source", "plan_plugin_source_takeover", "mutate_ui_plugin_source", "verify_ui_plugin_behavior", "inspect_ui_plugin_delivery"],
  services: ["inspect_ui_services", "prepare_ui_service_contract_change", "create_ui_service_contract", "mutate_ui_service_contract", "prepare_ui_service_implementation_change", "apply_ui_service_implementation_change"],
  integration: ["plan_agent_ui_integration", "verify_agent_ui_integration", "apply_agent_ui_integration", "prepare_agent_ui_integration_asset"],
  debugging: ["inspect_static_diagnostics", "inspect_runtime_errors", "inspect_runtime_layout", "select_debugging_target", "select_all_current_runtime_diagnostics"],
  history: ["inspect_creator_transactions", "inspect_creator_transaction", "inspect_creator_transaction_change", "inspect_creator_baseline", "undo_creator_run", "undo_creator_changes", "reapply_creator_changes"],
};
export function verificationToolDisabled(name: string, context: ToolContext): boolean {
  return context.verificationMode === "static_only" && ["inspect_runtime_errors", "inspect_runtime_layout", "select_all_current_runtime_diagnostics", "verify_ui_plugin_behavior"].includes(name);
}
export function visibleTool(name: string, context: ToolContext): boolean {
  if (verificationToolDisabled(name, context)) return false;
  if (name === "verify_ui_plugin_behavior" && !context.behaviorVerificationEnabled) return false;
  return (CORE.has(name) || [...context.groups].some(group => TOOL_GROUPS[group]?.includes(name))) && (!context.readOnly || READ_TOOLS.has(name) || /^(inspect_|list_|plan_|verify_agent_ui_integration)/u.test(name));
}

async function assertWrite(context: ToolContext, file: string) {
  context.signal.throwIfAborted();
  if (context.readOnly) throw new Error("TOOL_PERMISSION_DENIED: read-only request");
  await context.validation?.ensureBaseline();
  const name = logical(file), source = await sourceRoot(context.root);
  if (!name.startsWith(source + "/") || name.split("/").some(part => ["upstream", "vendor", "vendors", "framework", "runtime"].includes(part.toLowerCase()))) throw new Error("TOOL_PERMISSION_DENIED");
  context.debugging?.assertPath(name, source);
  const relative = name.slice(source.length + 1);
  if (["app-ui.json", "composition-revision.generated.json", "app-ui/app-ui.json", "app-ui/composition-revision.generated.json", "plugins/registry.generated.ts"].includes(relative.toLowerCase())) throw new Error("TOOL_PERMISSION_DENIED: use Operator mutation");
  const match = /^plugins\/([^/]+)\//u.exec(relative.toLowerCase());
  if (match) {
    const definition = await fileState(context.root, `${source}/plugins/${match[1]}/definition.ts`);
    const manifest = await fileState(context.root, `${source}/plugins/${match[1]}/manifest.json`);
    if (!definition.exists && !manifest.exists && !context.authorizedPlugins.has(match[1]!)) throw new Error("PLUGIN_DEVELOPMENT_AUTHORIZATION_REQUIRED");
    // Official implementation ownership is determined by the Host; local thin
    // applications stay editable, including before any source takeover.
    if (/\/(?:implementation|source)\//u.test(relative.toLowerCase())) {
      const inspected = await requestOperator(context.root, "inspect_ui_plugin", { pluginId: match[1] }, context.signal);
      if (inspected.application?.implementationOwnership === "npm") throw new Error("PLUGIN_SOURCE_TAKEOVER_REQUIRED");
    }
  }
  return name;
}
function json(value: unknown) { return JSON.stringify(value); }
const descriptions: Record<string, string> = {
  inspect_ui_project: "Inspect the current target project, composition, sourceRoot, ownership and authoring targets. Read current facts before choosing mutations.",
  inspect_ui_plugin: "Inspect a Plugin's actual installed public props, composition, source ownership and usage guide. Customize the project application before source takeover.",
  mutate_app_ui_model: "Apply a semantic AppUIModel operation with the exact observed current hash. AppUIModel owns layout and composition only.",
  takeover_plugin_source: "Present and confirm an installed-version per-Plugin source takeover plan. Ordinary customization is not consent.",
};
export async function createTools(context: ToolContext) {
  const messages = context.messages ?? defaultAgentMessages;
  context.debugging ??= new DebuggingEvidence();
  context.recovery ??= new ToolRecovery();
  context.investigation ??= new InvestigationState();
  context.validation ??= new CreatorValidation(context.root, context.activity, () => context.signal, context.debugging);
  const contracts = await agentContracts(context.contracts);
  const { operations, inputSchema } = await operatorContracts(context.contracts);
  const tools: any[] = [];
  const add = (name: string, description: string, schema: any, invoke: (input: any) => Promise<any> | any) => {
    const admitted = (input: any) => {
      assertExecutionOpen(context);
      if (verificationToolDisabled(name, context)) throw new Error("CREATOR_RUNTIME_VERIFICATION_DISABLED");
      return invoke(input);
    };
    (context.hostTools ??= new Map()).set(name, admitted);
    tools.push(tool(async (input: any) => {
      const started = performance.now();
      context.signal.throwIfAborted();
      try {
        const readIdentity = toolReadIdentity(name, input);
        if (readIdentity) await context.activity.log("tool_read_request", { toolName: name, input: readIdentity, revision: context.activity.revision });
        if (/^(?:edit_|create_|delete_|mutate_|takeover_|purge_|apply_|undo_|reapply_)/u.test(name)) delete context.noChangeOutcome;
        const result = await admitted(input);
        const investigation = context.investigation!.record(name, input, result, context.activity.revision);
        if (investigation) await context.activity.log("investigation_repeated_observation", { toolName: name, revision: context.activity.revision });
        if (["inspect_ui_plugin", "inspect_ui_edit_context"].includes(name)) rememberPublicApiRead(context, result,
          [input.focus, input.query, ...(input.sharedSymbols ?? [])].filter((value): value is string => typeof value === "string"));
        if (!READ_TOOLS.has(name) && result && (result.changed === false || result.status === "declined")) {
          const identity = await projectCheckIdentity(context.root, context.signal);
          if (identity !== undefined) context.noChangeOutcome = { toolName: name, status: result.status === "declined" ? "declined" : "already_current", identity };
          else if (result.status === "declined" || (typeof result.path === "string" && context.activity.observations.get(result.path)?.exists)) {
            context.noChangeOutcome = { toolName: name, status: result.status === "declined" ? "declined" : "already_current",
              identity: await editingProjectIdentity(context.root), metadataOnly: true,
              ...(typeof result.path === "string" && context.activity.observations.get(result.path)?.exists ? { file: { path: result.path, hash: context.activity.observations.get(result.path)!.hash } } : {}) };
          }
        }
        if (/^(inspect_|list_|read_file$|read_creator_context$|read_creator_documentation$|ls$|glob$|grep$)/u.test(name)) {
          const progress = (context.evidenceProgress ??= new EvidenceProgress()).observe(name, input, result, context.activity.revision, context.readOnly);
          if (progress.newEvidence) context.evidenceRevision = (context.evidenceRevision ?? 0) + 1;
          if (progress.recovery) context.recovery!.recordGuidance(progress.recovery);
          await context.activity.log("evidence_progress", { toolName: name, newEvidence: progress.newEvidence, unchangedReads: progress.unchangedReads, revision: context.activity.revision });
        }
        (context.toolObservations ??= []).push({ toolName: name, status: "success" });
        await context.activity.log("tool_finished", { toolName: name, status: "success", revision: context.activity.revision, durationMs: performance.now() - started });
        const recovery = context.recovery!.search(name, input, result, context.activity.revision);
        return json({ ok: true, result, ...(recovery ? { recovery } : {}), ...(investigation ? { investigation } : {}) });
      }
      catch (error) {
        if (isGraphInterrupt(error)) throw error;
        if (context.signal.aborted || (error && typeof error === "object" && "interrupts" in error)) throw error;
        // LangGraph interrupts use control-flow exceptions and must propagate.
        if ((error as Error)?.name?.includes("Interrupt") || (error as Error)?.constructor?.name?.includes("Interrupt")) throw error;
        const code = (error as any)?.code ?? (error as Error).message.split(":")[0];
        (context.toolObservations ??= []).push({ toolName: name, status: "error", reason: String(code) });
        const failure = error as any;
        if (context.verificationMode === "static_and_runtime" && failure.recovery?.action === "use_allowed_read_entry") {
          failure.recovery = { ...failure.recovery, alternatives: [{ tool: "inspect_runtime_layout", input: {}, toolGroup: "debugging",
            purpose: "For rendered UI dimensions, actual container/attribute locations and computed layout styles. Enable debugging alone first. This does not read npm implementation or protected configuration." }, ...failure.recovery.alternatives] };
        }
        const recovery = context.recovery!.failure(error);
        context.investigation!.record(name, input, { code, reason: failure.reason, scope: failure.scope, recovery }, context.activity.revision, true);
        await context.activity.log("tool_finished", { toolName: name, status: "error", code, revision: context.activity.revision, durationMs: performance.now() - started,
          ...(recovery ? { recovery, reason: (error as any).reason, scope: (error as any).scope } : {}) });
        if (["CREATOR_OPERATOR_RESTART_REQUIRED", "CREATOR_OPERATOR_RESULT_CONTRACT_INVALID", "OPERATOR_RESULT_CONTRACT_VIOLATION", "OPERATOR_TIMEOUT", "OPERATOR_OUTPUT_LIMIT", "CREATOR_RUN_FILE_CHANGED_EXTERNALLY", "CREATOR_TRANSACTION_SNAPSHOT_TOO_LARGE", "CREATOR_TRANSACTION_TOO_LARGE", "CREATOR_FILE_INVENTORY_LIMIT"].includes(code)) context.blocker = { code, message: (error as Error).message };
        if (failure.category === "workspace_integrity" && (failure.automaticRepairAllowed !== true || failure.recovery?.action === "stop_and_report_blocker")) context.blocker = { code, message: (error as Error).message };
        return json({ ok: false, error: { code: (error as any)?.code ?? (error as Error).message.split(":")[0], message: (error as Error).message,
          ...(failure.details ? { details: failure.details } : {}),
          ...(recovery ? { recovery } : {}) } });
      }
    }, { name, description, schema }));
  };
  for (const operation of operations.filter(item => item.agentExposed)) {
    const schema = operation.name === "inspect_ui_project"
      ? z.object({ view: z.literal("composition").optional(), detail: z.enum(["summary", "full"]).optional() })
      : operation.name === "inspect_ui_plugin" ? { ...inputSchema(operation), properties: { ...inputSchema(operation).properties, detail: { type: "string", enum: ["summary", "full"] } } }
      : operation.name === "takeover_plugin_source" ? z.object({ pluginId: z.string().min(1).max(100) })
      : inputSchema(operation);
    // planHash and cancellation are Host-owned Operator inputs, not prerequisites
    // for the model to reach the real takeover question.
    const acceptsCancellation = JSON.stringify(inputSchema(operation)).includes('"cancelMarker"');
    add(operation.name, descriptions[operation.name] ?? `Use the authoritative target Operator operation ${operation.name}. Use exact returned identities, paths and hashes.`, schema, async input => {
      const detail = ["inspect_ui_project", "inspect_ui_plugin"].includes(operation.name) ? input.detail : undefined;
      if (["inspect_ui_project", "inspect_ui_plugin"].includes(operation.name)) { const { detail: _detail, ...operatorInput } = input; input = operatorInput; }
      const mutation = operation.kind !== "read";
      if (mutation && context.readOnly) throw new Error("TOOL_PERMISSION_DENIED");
      if (operation.name === "mutate_app_ui_model") {
        // The coding Agent chooses concrete instances from project evidence.
        // Operator validates their identities, snapshot hash and composition.
        // Keep reversible disable semantics and source-purge confirmation.
        const project = await inspectProject(context, { view: "composition" });
        assertInstanceRetention(context.userMessage, input, project, context.pluginNames);
      }
      if (mutation) await context.validation!.ensureBaseline();
      if (operation.name === "mutate_app_ui_model") {
        const decision = await prepareCompositionApplications(context, input);
        if (decision) return decision;
      }
      if (operation.name === "purge_ui_plugin") {
        const question = { steps: [{ id: "plugin-removal", question: messages.purgeQuestion, description: json(input), options: [{ id: "purge", label: messages.purge }, { id: "cancel", label: messages.cancel }], selectionMode: "single", minSelections: 1, maxSelections: 1 }] };
        const answer: any = interrupt({ kind: "ask_user_question", ...question });
        if (answer.answers?.["plugin-removal"]?.[0] !== "purge") return cancelExecution(context, operation.name);
      }
      if (operation.name === "takeover_plugin_source") {
        const plan = await requestOperator(context.root, "plan_plugin_source_takeover", { pluginId: input.pluginId }, context.signal);
        const key = `plugin-source-${plan.planHash}`;
        const answer: any = interrupt({ kind: "ask_user_question", steps: [{ id: key, question: messages.takeoverQuestion.replace("{0}", input.pluginId), description: (plan.dependencyChanges?.length ? messages.takeoverDependencies + "\n\n" : "") + json(plan), options: [{ id: "approve", label: messages.approveTakeover }, { id: "decline", label: messages.cancel }], selectionMode: "single", minSelections: 1, maxSelections: 1 }] });
        if (answer.answers?.[key]?.[0] !== "approve") return cancelExecution(context, operation.name);
        const current = await requestOperator(context.root, "plan_plugin_source_takeover", { pluginId: input.pluginId }, context.signal);
        if (current.planHash !== plan.planHash) throw new Error("PLUGIN_SOURCE_PLAN_STALE");
        input = { ...input, planHash: plan.planHash };
      }
      if (operation.name === "create_custom_plugin" && !context.authorizedPlugins.has(input.pluginId ?? input.id)) throw new Error("PLUGIN_DEVELOPMENT_AUTHORIZATION_REQUIRED");
      const snapshot = mutation ? await context.activity.captureSource() : undefined;
      let result;
      try { result = operation.name === "inspect_ui_project" ? await inspectProject(context, input)
        : await requestOperator(context.root, operation.name, mutation && acceptsCancellation && context.cancelMarker ? { ...input, cancelMarker: context.cancelMarker } : input, context.signal); }
      finally { if (snapshot) await context.activity.observeOperatorChanges(snapshot, result); }
      if (operation.name === "inspect_ui_plugin") {
        const referenceOnly = Boolean(input.sharedModule || input.sharedSymbols?.length);
        try { await rememberInspectedPlugin(context, result, { referenceOnly }); }
        catch { context.signal.throwIfAborted(); if (!referenceOnly) delete context.editingSelection; }
        if (referenceOnly) result = projectPublicApiRead(result, input.pluginId);
      }
      if (operation.name === "inspect_ui_project") await rememberProjectTargets(context, result);
      if (operation.name === "inspect_ui_project" && context.verificationMode === "static_and_runtime") result = { ...result, runtimeObservation: runtimeObservationNavigation(result) };
      if (["inspect_ui_project", "inspect_app_ui_model", "inspect_app_ui_model_source"].includes(operation.name)) context.groups.add("composition");
      if (operation.name === "inspect_ui_project" && detail !== "full") return projectInspectionSummary(result);
      if (operation.name === "inspect_ui_plugin" && detail !== "full" && !input.sharedModule && !input.sharedSymbols?.length) return pluginInspectionSummary(result, input.pluginId);
      return result;
    });
  }
  add("enable_creator_tools", "Expose tool schemas for subsequent calls. Discovery never grants write permission.", z.object({ groups: z.array(z.enum(["composition", "plugin_authoring", "services", "integration", "debugging", "history"])) }), input => { for (const group of input.groups) context.groups.add(group); return { enabledGroups: [...context.groups] }; });
  add("inspect_ui_edit_context", "Get editing context for an official OR custom project Plugin: owner, fresh source pages and local imports, definition/manifest/slots, instances, Service dependencies, parent composition, installed public API/shared types and documentation section links. Use pluginId/targetId when known, or query current owners. Optional sharedSymbols/sharedModule use the same installed-type lookup as inspect_ui_plugin. Follow coverage.fileNavigation.nextRead for omitted source and references.documentation for relevant docs. Reads grant no write/development/takeover permission. Ordinary coding tools remain available.", editContextInput, input => inspectEditingContext(context, input));
  add("read_file", "Read a virtual project path or /skills/ resource. Read edit targets before editing. Paths use / on every OS.", z.object({ file_path: z.string(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(2000).default(2000) }), input => readProjectFile(context, input));
  add("read_creator_documentation", "Browse packaged public and internal reference docs without loading whole books. Use action=index with query (Chinese or English) for matching sections (8 documents/page); documentId optionally scopes the search to a known document. Follow the matching section nextRead directly; tableOfContents is optional navigation. Without filters the index lists topics. action=read with documentId returns a table of contents (32/page); add sectionId for bounded text (limit characters, max 8000). Follow nextRead/nextOffset. References describe this Creator version; inspect actual target code and installed APIs before editing. This tool grants no write authority or source freshness.", z.object({ action: z.enum(["index", "read"]).default("index"), query: z.string().max(300).optional(), topic: z.string().max(150).optional(), source: z.enum(["public", "internal"]).optional(), documentId: z.string().max(300).optional(), sectionId: z.string().max(80).optional(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(2).max(8000).default(4000) }), input => readCreatorDocumentation(input, context.documentationRoot));
  add("read_creator_context", "Read an exact run-local archived tool snapshot or submitted conversation history by artifactId and JSON path (for example [result, files, 0] or [result, messages, 0, content]). Use artifactId 'list' with empty path to discover full IDs if a summary abbreviated them. Use keys to navigate, then offset/limit character pages, including the index. This reads historical data only, never grants permission or refreshes filesystem observations. Ordinary source reads remain available.", z.object({ artifactId: z.union([z.literal("list"), z.string().regex(/^ctx-[a-f0-9]{64}$/u)]), path: z.array(z.union([z.string(), z.number().int().min(0)])).max(16).default([]), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(8000).default(2400) }), input => {
    if (!context.contextWindow) throw new Error("CREATOR_CONTEXT_ARTIFACT_NOT_FOUND");
    return context.contextWindow.artifacts.read(input.artifactId, input.path, input.offset, input.limit);
  });
  add("ls", "List an allowed virtual project directory.", z.object({ path: z.string().default("/") }), async input => {
    const location = await readPath(context, input.path === "/" ? "." : input.path);
    return (await readdir(location.target, { withFileTypes: true })).filter(item => !item.isSymbolicLink() && !["node_modules", ".git", ".agent-ui", "dist", "build"].includes(item.name) && !item.name.startsWith(".env")).map(item => ({ name: item.name, directory: item.isDirectory() }));
  });
  add("glob", "Find allowed project paths using slash-delimited glob syntax.", z.object({ pattern: z.string(), path: z.string().default("/") }), async input => {
    const pattern = input.pattern;
    const prefix = input.path === "/" ? "" : logical(input.path);
    const files = await walk(context.root, prefix);
    return files.filter(file => matchesGlob(file, path.posix.join(prefix, pattern))).slice(0, 1000);
  });
  add("grep", "Find literal project text first, with a bounded regular-expression fallback when no literal matches exist. Narrow path and glob when known.", z.object({ pattern: z.string().min(1), path: z.string().default("/"), glob: z.string().optional(), output_mode: z.enum(["files_with_matches", "content", "count"]).default("content") }), async input => {
    const prefix = input.path === "/" ? "" : logical(input.path);
    const location = prefix ? await readPath(context, prefix) : undefined;
    const { stat } = await import("node:fs/promises");
    const files = location && (await stat(location.target)).isFile() ? [prefix] : await walk(context.root, prefix);
    const hits: any[] = [], candidates: { path: string; content: string }[] = [];
    let bytes = 0;
    for (const name of files) {
      context.signal.throwIfAborted();
      if (input.glob && !matchesGlob(name, input.glob)) continue;
      const content = (await fileState(context.root, name)).content ?? "";
      if (content.length > 1_000_000) continue;
      bytes += Buffer.byteLength(content);
      if (bytes > 4_000_000) throw new Error("CREATOR_SEARCH_SCOPE_TOO_LARGE: narrow path or glob");
      candidates.push({ path: name, content });
      const lines = content.split("\n").flatMap((line, index) => line.includes(input.pattern) ? [{ line: index + 1, text: line.slice(0, 1500) }] : []);
      if (lines.length) hits.push(input.output_mode === "files_with_matches" ? name : input.output_mode === "count" ? { path: name, count: lines.length } : { path: name, matches: lines.slice(0, 100) });
      if (hits.length >= 100) break;
    }
    if (hits.length) return hits;
    const fallback = await regexSearch(candidates, input.pattern, context.signal);
    return fallback.map(hit => input.output_mode === "files_with_matches" ? hit.path : input.output_mode === "count" ? { path: hit.path, count: hit.count } : { path: hit.path, matches: hit.matches });
  });
  add("edit_file", "Replace exact text in a freshly read project application or owned adapter. AppUIModel and upstream source are protected.", z.object({ file_path: z.string(), old_string: z.string().min(1), new_string: z.string(), replace_all: z.boolean().default(false) }), async input => {
    const name = await assertWrite(context, input.file_path);
    const before = await context.activity.observations.assertFreshForEdit(name);
    const content = before.content ?? "";
    const occurrences = content.split(input.old_string).length - 1;
    if (!occurrences || (occurrences > 1 && !input.replace_all)) throw new Error("EDIT_MATCH_AMBIGUOUS_OR_MISSING");
    const after = input.replace_all ? content.replaceAll(input.old_string, input.new_string) : content.replace(input.old_string, input.new_string);
    if (after === content) return { path: name, changed: false, revision: context.activity.revision };
    await context.activity.capture(name); context.signal.throwIfAborted();
    await replaceCreatorFileAtomically(context.root, name, after, before, context.signal);
    context.activity.recordAfter(name, { exists: true, hash: creatorContentHash(after), content: after });
    context.activity.revision++; await context.activity.observations.observe(name);
    return { path: name, occurrences, revision: context.activity.revision };
  });
  add("verify_creator_outcome", "Read-only verification of exact goal conditions, including requests already satisfied without edits. Check Plugin enablement/composition or exact project file text; all checks must pass. Does not prove runtime behavior or grant permission.", z.object({ checks: creatorPostconditions }), async input => {
    delete context.noChangeOutcome;
    const result = await checkCreatorPostconditions(context, input.checks);
    if (result.status === "satisfied") context.noChangeOutcome = { toolName: "verify_creator_outcome", status: "already_current", identity: "", postconditions: input.checks };
    return result;
  });
  add("edit_file_from_read", "Edit only freshly read lines without retyping old text. Supply a 1-based inclusive line range; the tool preserves line boundaries and the file's newline style. Reread after a changed-file rejection.", z.object({ file_path: z.string(), mode: z.enum(["replace_lines", "insert_before_line", "insert_after_line"]), start_line: z.number().int().min(1), end_line: z.number().int().min(1).optional(), replacement: z.string() }), async input => {
    const name = await assertWrite(context, input.file_path);
    const before = await context.activity.observations.assertFreshForEdit(name);
    const end = input.end_line ?? input.start_line;
    if (end < input.start_line || !context.readRanges?.get(name)?.some(range => range.hash === before.hash && range.start <= input.start_line && range.end >= end)) throw new Error("READ_RANGE_REQUIRED");
    const after = editReadLines(before.content ?? "", input);
    if (after === before.content) return { path: name, changed: false, revision: context.activity.revision };
    await context.activity.capture(name); context.signal.throwIfAborted();
    await replaceCreatorFileAtomically(context.root, name, after, before, context.signal);
    context.activity.recordAfter(name, { exists: true, hash: creatorContentHash(after), content: after });
    context.activity.revision++; await context.activity.observations.observe(name);
    return { path: name, revision: context.activity.revision };
  });
  add("create_ui_source_file", "Create a new project source file within the authorized scope. New Plugin implementations require an approved development plan.", z.object({ path: z.string(), content: z.string().max(120000) }), async input => {
    const name = await assertWrite(context, input.path);
    await context.activity.capture(name); context.signal.throwIfAborted();
    await createCreatorFileAtomically(context.root, name, input.content, context.signal);
    context.activity.recordAfter(name, { exists: true, hash: creatorContentHash(input.content), content: input.content });
    context.activity.revision++; await context.activity.observations.observe(name);
    return { path: name, revision: context.activity.revision };
  });
  add("delete_ui_source_file", "Delete one freshly read project source file under the same write guards as edits. The deletion is recorded for undo/reapply; generated composition, upstream and runtime files stay protected.", z.object({ path: z.string() }), async input => {
    const name = await assertWrite(context, input.path);
    const before = await context.activity.observations.assertFreshForEdit(name);
    await context.activity.capture(name); context.signal.throwIfAborted();
    await removeCreatorFile(context.root, name, before);
    context.activity.recordAfter(name, { exists: false, hash: CREATOR_MISSING_FILE_HASH });
    context.activity.revision++; await context.activity.observations.observe(name);
    return { path: name, deleted: true, revision: context.activity.revision };
  });
  add("create_ui_plugin", "Atomically create one approved project-owned UI Plugin. Supply manifest.json, definition.ts and index.tsx; do not copy npm implementations or change Composition here. validate_creator_changes synchronizes its registry before checks; no project generator script is needed. Creation alone does not mount it.", contracts.schema("CreateUIPluginInput"), input => {
    contracts.validate("CreateUIPluginInput", input);
    return createPlugin(context, input);
  });
  add("mutate_ui_plugin_source", "Atomically edit/create files inside exactly one existing Plugin. Every edit target needs a fresh read. Use delete_ui_source_file for deletion. No rename, cross-Plugin paths or upstream edits.", contracts.schema("MutateUIPluginSourceInput"), input => {
    contracts.validate("MutateUIPluginSourceInput", input);
    return mutatePlugin(context, input, file => assertWrite(context, file));
  });
  add("prepare_ui_service_contract_change", "Preflight a project Service contract change against current identities, ownership and file state. No user confirmation. contractPath is sourceRoot-relative services/*.ts. Ordinary project file editing is also available.", contracts.schema("PrepareUIServiceContractChangeInput"), input => {
    contracts.validate("PrepareUIServiceContractChangeInput", input); return prepareService(context, input);
  });
  for (const [name, schema, kind] of [["create_ui_service_contract", "CreateUIServiceContractInput", "create"], ["mutate_ui_service_contract", "MutateUIServiceContractInput", "mutate"]] as const) add(name, "Apply a preflighted Service contract change using planId; recheck topology and file state. No user confirmation.", contracts.schema(schema), input => {
    contracts.validate(schema, input); return applyService(context, input, kind);
  });
  add("prepare_ui_service_implementation_change", "Preflight exact edits to an existing project Service implementation. Inspect references and preserve public declarations. No user confirmation; ordinary project edits are also available. Read the target first.", contracts.schema("PrepareUIServiceImplementationChangeInput"), input => {
    contracts.validate("PrepareUIServiceImplementationChangeInput", input); return prepareServiceImplementation(context, input);
  });
  add("apply_ui_service_implementation_change", "Apply the exact preflighted implementation diff using planId. It is single-use and checks current file/reference state. No user confirmation. Validate actual requests afterwards.", contracts.schema("ApplyUIServiceImplementationChangeInput"), input => {
    contracts.validate("ApplyUIServiceImplementationChangeInput", input); return applyServiceImplementation(context, input);
  });
  const questionSchema = z.object({ steps: z.array(z.object({ id: z.string().min(1), question: z.string().min(1), description: z.string().optional(), options: z.array(z.object({ id: z.string(), label: z.string(), description: z.string().optional() })).min(2).max(7), selectionMode: z.enum(["single", "multiple"]), minSelections: z.number().int().min(0), maxSelections: z.number().int().min(1) })).min(1).max(3) });
  add("ask_user_question", "Ask a material question and suspend until the current user answers. Cannot grant source ownership.", questionSchema, input => {
    const question = parseCreatorQuestion({ kind: "question", id: "validation", interruptId: "validation", status: "pending", steps: input.steps });
    if (!question) throw new Error("CREATOR_QUESTION_INVALID");
    return interrupt({ kind: "ask_user_question", steps: question.steps });
  });
  add("prepare_ui_plugin_development", "Ask once before creating a NEW Plugin identity. Existing project Plugin behavior and supporting files are edited directly. Only targetPluginId and desiredOutcome are required; implementation and verification details may be added later without another question. No full catalog search is required. npm source takeover uses its own question.", contracts.schema("PrepareUIPluginDevelopmentInput"), input => {
    contracts.validate("PrepareUIPluginDevelopmentInput", input);
    return prepareDevelopment(context, input);
  });
  add("inspect_ui_capabilities", "Inspect installed capabilities and current project composition; no ownership or mutation authority is granted.", z.object({}), async () => ({ plugins: await requestOperator(context.root, "list_ui_plugins", {}, context.signal), services: await requestOperator(context.root, "inspect_ui_services", {}, context.signal) }));
  add("validate_creator_changes", "Synchronize changed Plugin manifests/definitions into the generated registry, then run target typecheck and structural validation for the current revision, optionally build. This is the registry synchronization entry; do not search for a project generator script or hand-edit the registry. With includeBuild=true call this tool alone. Preserve unrelated baseline diagnostics as warnings in delta mode. Identical successful checks may be reused; force reruns them. Optional postconditions verify requested source/composition conditions in this same call; use them for preservation checks instead of separate reads. These are static conditions, not interaction tests.", z.object({ includeBuild: z.boolean().default(false), mode: z.enum(["delta", "clean"]).default("delta"), force: z.boolean().default(false), postconditions: creatorPostconditions.optional() }), async input => {
    const result = await context.validation!.validate(input);
    if (!input.postconditions) return result;
    context.requiredPostconditions = input.postconditions;
    const sourceConditions = await checkCreatorPostconditions(context, input.postconditions);
    context.sourceConditionsFailed = sourceConditions.status !== "satisfied";
    context.sourceVerification = { status: sourceConditions.status, revision: context.activity.revision, checked: input.postconditions.length };
    if (result.status === "passed" && !context.sourceConditionsFailed) {
      context.noChangeOutcome = { toolName: "validate_creator_changes", status: "already_current", identity: "", postconditions: input.postconditions };
    } else delete context.noChangeOutcome;
    return { ...result, sourceConditions };
  });
  add("inspect_static_diagnostics", "Inspect current target TypeScript and structural diagnostics without claiming visual acceptance.", z.object({}), async () => { const result = await context.validation!.inspectStatic(); context.debugging!.observeStatic(result); return result; });
  add("inspect_runtime_errors", "Inspect diagnostics bound to this thread and the current AppUIModel hash. Stale or unavailable evidence is not a pass.", z.object({ includeStale: z.boolean().default(false) }), input => inspectRuntime(context, input));
  add("inspect_runtime_layout", "Request fresh bounded geometry, semantic-region structure and computed layout styles from the connected preview. Inspect zero widths and actual attribute locations using these facts before repeating source searches. Use current inspect_ui_project instance IDs and nodeRefs; runtime nodeId and arbitrary DOM selectors are not nodeRefs. Omit filters to discover geometry and root structure; narrow filters for truncated structure. No page text, input values or arbitrary JavaScript. A bounded refresh timeout is an observation gap, not a source defect.", z.object({ instanceIds: z.union([z.string(), z.array(z.string()).max(50)]).optional(), nodeRefs: z.union([z.string(), z.array(z.string()).max(50)]).optional() }), input => inspectRuntime(context, { ...input, refresh: true }));
  add("select_debugging_target", "Select one fresh observed debuggingTargetId for the error the user asked to fix. If multiple errors are plausible, ask the user first. Selection does not grant write permission.", z.object({ target_id: z.string() }), async input => { await context.validation!.ensureBaseline(); return context.debugging!.select(input.target_id, context.activity.revision); });
  add("select_all_current_runtime_diagnostics", "Select all currently observed runtime errors only for an explicit user request to fix all current errors. Requires fresh pre-mutation evidence; does not grant write authority.", z.object({}), () => {
    if (!context.debugging!.runtimeBaseline || context.debugging!.runtimeRevision !== context.activity.revision || !context.debugging!.runtimeCurrent?.size) throw new Error("DEBUGGING_BASELINE_REQUIRED");
    if (!/(?:所有|全部|all).{0,20}(?:错误|诊断|error|diagnostic)|(?:错误|诊断|error|diagnostic).{0,20}(?:所有|全部|all)/iu.test(context.userMessage)) throw new Error("DEBUGGING_ALL_CURRENT_NOT_AUTHORIZED");
    const targets = [...context.debugging!.runtimeCurrent].map(id => context.debugging!.select(id, context.activity.revision));
    return { status: "selected", scope: "all_current_runtime", targetCount: targets.length };
  });
  for (const action of ["undo", "reapply"] as const) add(`${action}_creator_changes`, "Restore a run transaction only when every current file matches its expected hash. Preserve unrelated later edits.", z.object({ runId: z.string() }), async input => {
    if (context.readOnly) throw new Error("TOOL_PERMISSION_DENIED");
    const result = await restoreTransaction(context.root, input.runId, action, context.signal);
    await context.activity.recordRecovery(input.runId, action, result.changedPaths);
    return result;
  });
  addExtraTools(context, add);
  return tools;
}
