import { interrupt } from "@langchain/langgraph";
import { sourceRoot } from "./activity.js";
import { creatorContentHash as hash } from "./files/creatorFileState.js";
import { requestOperator } from "./operator.js";
import { defaultAgentMessages } from "./messages.js";
/** One native question before creating a Plugin identity; never a file permission plan. */
export async function prepareDevelopment(context, input) {
    if (context.readOnly)
        throw new Error("TOOL_PERMISSION_DENIED");
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/u.test(input.targetPluginId))
        throw new Error("PLUGIN_ID_INVALID");
    const workKind = input.workKind ?? "create-plugin";
    if (!["create-plugin", "adapt-component"].includes(workKind))
        throw new Error("PLUGIN_DEVELOPMENT_NEW_ID_REQUIRED");
    const previous = context.pluginPlans?.get(input.targetPluginId);
    const result = () => {
        context.groups.add("plugin_authoring");
        return { status: "authorized", targetPluginId: input.targetPluginId, confirmation: "new-plugin-development" };
    };
    if (context.authorizedPlugins.has(input.targetPluginId)) {
        // Verification details may be added after design/implementation, without asking again.
        if (previous && input.deliveryContract) {
            previous.contract = input.deliveryContract;
            previous.scopeHash = hash(JSON.stringify(input.deliveryContract));
        }
        return result();
    }
    const source = await sourceRoot(context.root);
    const identities = (inventory) => new Set([...(inventory.pluginAssets ?? []).map((item) => item.pluginId ?? item.id),
        ...(inventory.plugins ?? []).map((item) => item.pluginId ?? item.id), ...(inventory.capabilityCatalog?.pluginIds ?? [])]);
    const inventory = await requestOperator(context.root, "list_ui_plugins", {}, context.signal);
    if (identities(inventory).has(input.targetPluginId))
        throw new Error("PLUGIN_ALREADY_EXISTS: edit the existing project Plugin directly; npm implementation takeover has its own question");
    const contract = input.deliveryContract ?? {};
    const sourceOnly = /(?:只|仅).{0,12}(?:源码|代码)|不(?:要)?(?:挂载|接入|组合)|source.only/iu.test(context.userMessage);
    const plan = { scopeHash: hash(JSON.stringify(contract)), contract, workKind, status: "pending", sourceOnly };
    (context.pluginPlans ??= new Map()).set(input.targetPluginId, plan);
    const messages = context.messages ?? defaultAgentMessages;
    const description = [`${messages.developmentOutcome}: ${input.desiredOutcome}`, `${messages.developmentTarget}: ${input.targetPluginId}`,
        ...(input.missingCapabilities?.length ? [`${messages.developmentGap}: ${input.missingCapabilities.join("; ")}`] : []),
        ...(contract.placement ? [contract.placement] : [])].join("\n\n");
    const answer = interrupt({ kind: "ask_user_question", steps: [{ id: "plugin-development-decision", question: messages.developmentQuestion, description,
                options: [{ id: "start", label: messages.start }, { id: "adjust", label: messages.adjust }, { id: "defer", label: messages.defer }], selectionMode: "single", minSelections: 1, maxSelections: 1 }] });
    if (answer.answers?.["plugin-development-decision"]?.[0] !== "start") {
        context.developmentDecision = answer.answers?.["plugin-development-decision"]?.[0] === "adjust" ? "adjust" : "defer";
        plan.status = "declined";
        return { status: "declined" };
    }
    // Creation still checks project identity and existence; actual edits check their file versions.
    if (source !== await sourceRoot(context.root))
        throw new Error("PLUGIN_DEVELOPMENT_PLAN_STALE");
    const current = await requestOperator(context.root, "list_ui_plugins", {}, context.signal);
    if (identities(current).has(input.targetPluginId))
        throw new Error("PLUGIN_ALREADY_EXISTS");
    plan.status = "authorized";
    context.authorizedPlugins.add(input.targetPluginId);
    context.activePluginId = input.targetPluginId;
    context.evidenceRevision = (context.evidenceRevision ?? 0) + 1;
    return result();
}
//# sourceMappingURL=development-tools.js.map