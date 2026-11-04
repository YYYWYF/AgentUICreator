import { creatorContentHash as hash, readCreatorFileState as read } from "./files/creatorFileState.js";
import { requestOperator } from "./operator.js";
import { commitBatch, applyEdits } from "./source-tools.js";
import { sourceRoot } from "./activity.js";
const plans = new WeakMap();
function store(context) { let value = plans.get(context); if (!value) {
    value = new Map();
    plans.set(context, value);
} return value; }
function pathAllowed(value) {
    return typeof value === "string" && value.startsWith("services/") && value.endsWith(".ts") && !value.endsWith(".d.ts") && !/[\\:\x00]/u.test(value) && !value.split("/").some(part => !part || part === "." || part === "..");
}
async function checkTopology(context, spec, proposedPlugins = []) {
    if (!["create", "mutate"].includes(spec.changeKind) || !pathAllowed(spec.contractPath) || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/u.test(spec.serviceName))
        throw new Error("SERVICE_CONTRACT_PROPOSAL_INVALID");
    const identities = [spec.ownerPluginId, ...spec.consumers.map((item) => item.pluginId)];
    if (new Set(identities).size !== identities.length || identities.some(id => !/^[a-z0-9][a-z0-9-]{0,99}$/u.test(id)))
        throw new Error("SERVICE_CONTRACT_PROPOSAL_INVALID");
    const topology = await requestOperator(context.root, "inspect_ui_services", {}, context.signal);
    const inventory = await requestOperator(context.root, "list_ui_plugins", {}, context.signal);
    const existing = new Set([...(inventory.pluginAssets ?? []).map((item) => item.pluginId ?? item.id), ...(inventory.plugins ?? []).map((item) => item.pluginId ?? item.id), ...(inventory.capabilityCatalog?.pluginIds ?? [])]);
    // A bound, Host-authorized new Plugin plan is enough to propose its Service
    // dependency before either source subtree is written. It grants no Service consent.
    for (const [id, plan] of context.pluginPlans ?? []) {
        if (plan.status === "authorized" && context.authorizedPlugins.has(id))
            existing.add(id);
    }
    // Only the enclosing Host proposal supplies these identities. This permits
    // inspection before its user decision; it does not grant creation authority.
    for (const id of proposedPlugins)
        existing.add(id);
    const missing = identities.filter(id => !existing.has(id));
    if (missing.length)
        throw new Error(`SERVICE_CONTRACT_PLUGIN_NOT_FOUND: ${missing.join(", ")}. Use current inventory identities or a Host-authorized new-Plugin development plan.`);
    const service = topology.services?.find((item) => item.name === spec.serviceName);
    if (spec.changeKind === "create" && service)
        throw new Error("SERVICE_CONTRACT_ALREADY_EXISTS");
    if (spec.changeKind === "mutate") {
        if (!service || service.contractPaths?.length !== 1 || service.contractPaths[0] !== spec.contractPath || service.providers?.length !== 1 || service.providers[0].pluginId !== spec.ownerPluginId)
            throw new Error("SERVICE_OWNERSHIP_MISMATCH");
        const actual = [...(service.requiredConsumers ?? []).map((item) => `${item.pluginId}:required`), ...(service.optionalConsumers ?? []).map((item) => `${item.pluginId}:optional`)].sort();
        const requested = spec.consumers.map((item) => `${item.pluginId}:${item.dependencyMode}`).sort();
        if (JSON.stringify(actual) !== JSON.stringify(requested))
            throw new Error("SERVICE_OWNERSHIP_MISMATCH");
    }
}
export async function proposeService(context, input, proposedPlugins = []) {
    const spec = Object.fromEntries(["changeKind", "serviceName", "contractPath", "ownerPluginId", "consumers"].map(key => [key, input[key]]));
    if (Object.values(spec).some(value => value == null))
        throw new Error("SERVICE_CONTRACT_PROPOSAL_INVALID");
    spec.consumers = spec.consumers.map((item) => ({ pluginId: item.pluginId, dependencyMode: item.dependencyMode })).sort((a, b) => a.pluginId.localeCompare(b.pluginId));
    await checkTopology(context, spec, proposedPlugins);
    const file = `${await sourceRoot(context.root)}/${spec.contractPath}`;
    const before = await read(context.root, file);
    if (before.exists !== (spec.changeKind === "mutate"))
        throw new Error("SERVICE_CONTRACT_PLAN_STALE");
    const id = hash(JSON.stringify({ threadId: context.threadId, runId: context.activity.runId, spec, file, sourceHash: before.hash, reason: input.reason }));
    let plan = store(context).get(id);
    if (!plan) {
        plan = { id, spec, file, hash: hash(JSON.stringify(spec)), status: "pending", sourceHash: before.hash };
        store(context).set(id, plan);
    }
    return plan;
}
export async function validateServiceProposal(context, id, proposedPlugins = []) {
    const plan = store(context).get(id);
    if (!plan || plan.status === "applied")
        throw new Error("SERVICE_CONTRACT_PLAN_INVALID");
    await checkTopology(context, plan.spec, proposedPlugins);
    if (`${await sourceRoot(context.root)}/${plan.spec.contractPath}` !== plan.file || (await read(context.root, plan.file)).hash !== plan.sourceHash)
        throw new Error("SERVICE_CONTRACT_PLAN_STALE");
}
/** Optional preflight for structured Service edits; ordinary project editing needs no approval. */
export async function prepareService(context, input) {
    if (context.readOnly)
        throw new Error("TOOL_PERMISSION_DENIED");
    const plan = await proposeService(context, input);
    await validateServiceProposal(context, plan.id);
    plan.status = "ready";
    return { status: "ready", planId: plan.id, spec: plan.spec, file: plan.file };
}
export async function applyService(context, input, kind) {
    if (context.readOnly)
        throw new Error("TOOL_PERMISSION_DENIED");
    const plan = store(context).get(input.planId);
    if (!plan || plan.status !== "ready" || plan.spec.changeKind !== kind)
        throw new Error("SERVICE_CONTRACT_PLAN_INVALID");
    await checkTopology(context, plan.spec);
    if (`${await sourceRoot(context.root)}/${plan.spec.contractPath}` !== plan.file)
        throw new Error("SERVICE_CONTRACT_PLAN_STALE");
    const before = await read(context.root, plan.file);
    if (before.hash !== plan.sourceHash || before.exists !== (kind === "mutate"))
        throw new Error("SERVICE_CONTRACT_PLAN_STALE");
    if (kind === "mutate")
        await context.activity.observations.assertFreshForEdit(plan.file);
    await context.validation.ensureBaseline();
    const content = kind === "create" ? input.content : applyEdits(before.content ?? "", input.edits);
    const result = await commitBatch(context, [{ path: plan.file, before, content }]);
    plan.status = "applied";
    return { ...result, planId: plan.id, status: "applied", verificationRequired: true };
}
//# sourceMappingURL=service-tools.js.map