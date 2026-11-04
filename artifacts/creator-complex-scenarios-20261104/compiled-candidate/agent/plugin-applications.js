import { preparePluginEnablement, completePluginEnablement } from "@za38.03/agent-ui-creator/project/commands";
import { inspectProject } from "./inspection.js";
/** Composition must use the installed Plugin's project application and Host
 * bindings. Preparing that thin layer is separate from implementation takeover. */
export async function prepareCompositionApplications(context, input) {
    if (context.readOnly)
        throw new Error("TOOL_PERMISSION_DENIED");
    const ids = new Set();
    const visit = (value) => {
        if (!value || typeof value !== "object")
            return;
        if (typeof value.pluginId === "string")
            ids.add(value.pluginId);
        for (const child of Object.values(value))
            if (Array.isArray(child))
                child.forEach(visit);
            else if (child && typeof child === "object")
                visit(child);
    };
    for (const operation of input.operations ?? [])
        visit(operation);
    const enabled = (input.operations ?? []).filter(operation => operation.type === "set_plugin_enabled" && operation.enabled);
    const actions = (input.operations ?? []).filter(operation => operation.type === "execute_creator_action");
    if (enabled.length || actions.length) {
        const project = await inspectProject(context, { view: "composition" });
        for (const operation of enabled) {
            const instance = project.pluginInstances?.find((item) => item.id === operation.instanceId);
            if (instance)
                ids.add(instance.pluginId);
        }
        for (const operation of actions) {
            const action = project.creatorActions?.candidates?.find((item) => item.actionId === operation.actionId);
            if (action?.kind === "add_existing_plugin")
                ids.add(action.target.pluginId);
        }
    }
    const plans = [];
    for (const pluginId of ids) {
        context.signal.throwIfAborted();
        let plan;
        try {
            plan = await preparePluginEnablement(context.root, pluginId);
        }
        catch (error) {
            // Custom Plugins do not have an installed official application recipe.
            if (error.message === "PLUGIN_UNAVAILABLE")
                continue;
            throw error;
        }
        if (plan.packages.length)
            throw Object.assign(new Error("PLUGIN_ENABLEMENT_DEPENDENCIES_REQUIRED: Use Creator /enable to review and install this Plugin's required packages before composition."), { code: "PLUGIN_ENABLEMENT_DEPENDENCIES_REQUIRED", preparation: plan });
        if (!plan.files.length)
            continue;
        plans.push(plan);
    }
    for (const plan of plans) {
        // Requested installed Plugins already have an identity and npm source.
        // Missing thin application files are ordinary project code, not takeover.
        // Earlier applications can add shared Host bindings; replan against them.
        const current = await preparePluginEnablement(context.root, plan.pluginId);
        if (current.packages.length)
            throw Object.assign(new Error("PLUGIN_ENABLEMENT_DEPENDENCIES_REQUIRED"), { code: "PLUGIN_ENABLEMENT_DEPENDENCIES_REQUIRED", preparation: current });
        if (!current.files.length)
            continue;
        context.signal.throwIfAborted();
        const snapshot = await context.activity.captureSource();
        let result;
        try {
            const applied = await completePluginEnablement(context.root, current);
            result = { ...applied, changedPaths: applied.createdPaths };
        }
        finally {
            await context.activity.observeOperatorChanges(snapshot, result);
        }
        context.signal.throwIfAborted();
    }
    return undefined;
}
//# sourceMappingURL=plugin-applications.js.map