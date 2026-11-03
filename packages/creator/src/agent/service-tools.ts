import { defaultAgentMessages } from "./messages.js";
import { interrupt } from "@langchain/langgraph";
import { creatorContentHash as hash, readCreatorFileState as read } from "./files/creatorFileState.js";
import { requestOperator } from "./operator.js";
import { commitBatch, applyEdits } from "./source-tools.js";
import type { ToolContext } from "./tools.js";
import { cancelExecution } from "./execution-decision.js";
import { sourceRoot } from "./activity.js";

interface ServicePlan { id: string; spec: any; file: string; hash: string; status: "pending" | "authorized" | "applied"; sourceHash: string }
const plans = new WeakMap<ToolContext, Map<string, ServicePlan>>();
function store(context: ToolContext) { let value = plans.get(context); if (!value) { value = new Map(); plans.set(context, value); } return value; }
function pathAllowed(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("services/") && value.endsWith(".ts") && !value.endsWith(".d.ts") && !/[\\:\x00]/u.test(value) && !value.split("/").some(part => !part || part === "." || part === "..");
}
async function checkTopology(context: ToolContext, spec: any) {
  if (!pathAllowed(spec.contractPath) || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/u.test(spec.serviceName)) throw new Error("SERVICE_CONTRACT_PROPOSAL_INVALID");
  const identities = [spec.ownerPluginId, ...spec.consumers.map((item: any) => item.pluginId)];
  if (new Set(identities).size !== identities.length || identities.some(id => !/^[a-z0-9][a-z0-9-]{0,99}$/u.test(id))) throw new Error("SERVICE_CONTRACT_PROPOSAL_INVALID");
  const topology = await requestOperator(context.root, "inspect_ui_services", {}, context.signal);
  const inventory = await requestOperator(context.root, "list_ui_plugins", {}, context.signal);
  const existing = new Set([...(inventory.pluginAssets ?? []).map((item: any) => item.pluginId ?? item.id), ...(inventory.plugins ?? []).map((item: any) => item.pluginId ?? item.id), ...(inventory.capabilityCatalog?.pluginIds ?? [])]);
  // A bound, Host-authorized new Plugin plan is enough to propose its Service
  // dependency before either source subtree is written. It grants no Service consent.
  for (const [id, plan] of context.pluginPlans ?? []) {
    if (plan.status === "authorized" && context.authorizedPlugins.has(id) && plan.workKind !== "extend-capability") existing.add(id);
  }
  const missing = identities.filter(id => !existing.has(id));
  if (missing.length) throw new Error(`SERVICE_CONTRACT_PLUGIN_NOT_FOUND: ${missing.join(", ")}. Use current inventory identities or a Host-authorized new-Plugin development plan.`);
  const service = topology.services?.find((item: any) => item.name === spec.serviceName);
  if (spec.changeKind === "create" && service) throw new Error("SERVICE_CONTRACT_ALREADY_EXISTS");
  if (spec.changeKind === "mutate") {
    if (!service || service.contractPaths?.length !== 1 || service.contractPaths[0] !== spec.contractPath || service.providers?.length !== 1 || service.providers[0].pluginId !== spec.ownerPluginId) throw new Error("SERVICE_OWNERSHIP_MISMATCH");
    const actual = [...(service.requiredConsumers ?? []).map((item: any) => `${item.pluginId}:required`), ...(service.optionalConsumers ?? []).map((item: any) => `${item.pluginId}:optional`)].sort();
    const requested = spec.consumers.map((item: any) => `${item.pluginId}:${item.dependencyMode}`).sort();
    if (JSON.stringify(actual) !== JSON.stringify(requested)) throw new Error("SERVICE_OWNERSHIP_MISMATCH");
  }
}
export async function prepareService(context: ToolContext, input: any) {
  const messages = context.messages ?? defaultAgentMessages;
  if (context.readOnly) throw new Error("TOOL_PERMISSION_DENIED");
  if (input.mode === "confirm") {
    const plan = store(context).get(input.proposalId);
    if (!plan || plan.status !== "authorized" || input.userAuthorizationEvidence !== context.userMessage) throw new Error("SERVICE_USER_AUTHORIZATION_REQUIRED");
    await checkTopology(context, plan.spec);
    return { status: "authorized", authorizationId: plan.id, proposalId: plan.id, spec: plan.spec };
  }
  if (input.mode !== "propose") throw new Error("SERVICE_CONTRACT_PROPOSAL_INVALID");
  const spec = Object.fromEntries(["changeKind", "serviceName", "contractPath", "ownerPluginId", "consumers"].map(key => [key, input[key]]));
  if (Object.values(spec).some(value => value == null)) throw new Error("SERVICE_CONTRACT_PROPOSAL_INVALID");
  await checkTopology(context, spec);
  const file = `${await sourceRoot(context.root)}/${spec.contractPath}`;
  const before = await read(context.root, file);
  const id = hash(JSON.stringify({ threadId: context.threadId, runId: context.activity.runId, spec, file, sourceHash: before.hash }));
  let plan = store(context).get(id);
  if (!plan) { plan = { id, spec, file, hash: hash(JSON.stringify(spec)), status: "pending", sourceHash: before.hash }; store(context).set(id, plan); }
  const direct = input.userAuthorizationEvidence === context.userMessage && context.userMessage.includes(spec.serviceName) && /(?:新增|创建|修改|实现|create|change|implement)/iu.test(context.userMessage) && !/(?:不要|是否|只读|分析|评估|do not)/iu.test(context.userMessage);
  if (!direct) {
    const step = `service-contract-${id}`;
    const answer: any = interrupt({ kind: "ask_user_question", steps: [{ id: step, question: messages.serviceQuestion, description: JSON.stringify({ ...spec, resolvedContractPath: file, reason: input.reason }), options: [{ id: "approve", label: messages.approveService }, { id: "decline", label: messages.cancel }], selectionMode: "single", minSelections: 1, maxSelections: 1 }] });
    if (answer.answers?.[step]?.[0] !== "approve") return { ...cancelExecution(context, "prepare_ui_service_contract_change"), proposalId: id };
  }
  await checkTopology(context, spec);
  if (`${await sourceRoot(context.root)}/${spec.contractPath}` !== plan.file || (await read(context.root, plan.file)).hash !== plan.sourceHash) throw new Error("SERVICE_CONTRACT_AUTHORIZATION_STALE");
  plan.status = "authorized";
  return { status: "authorized", authorizationId: id, proposalId: id, spec };
}
export async function applyService(context: ToolContext, input: any, kind: "create" | "mutate") {
  if (context.readOnly) throw new Error("TOOL_PERMISSION_DENIED");
  const plan = store(context).get(input.authorizationId);
  if (!plan || plan.status !== "authorized" || plan.spec.changeKind !== kind) throw new Error("SERVICE_CONTRACT_AUTHORIZATION_SCOPE_MISMATCH");
  await checkTopology(context, plan.spec);
  if (`${await sourceRoot(context.root)}/${plan.spec.contractPath}` !== plan.file) throw new Error("SERVICE_CONTRACT_AUTHORIZATION_STALE");
  const before = await read(context.root, plan.file);
  if (before.hash !== plan.sourceHash || before.exists !== (kind === "mutate")) throw new Error("SERVICE_CONTRACT_AUTHORIZATION_STALE");
  if (kind === "mutate") await context.activity.observations.assertFreshForEdit(plan.file);
  await context.validation!.ensureBaseline();
  const content = kind === "create" ? input.content : applyEdits(before.content ?? "", input.edits);
  const result = await commitBatch(context, [{ path: plan.file, before, content }]);
  plan.status = "applied";
  return { ...result, authorizationId: plan.id, status: "applied", verificationRequired: true };
}
