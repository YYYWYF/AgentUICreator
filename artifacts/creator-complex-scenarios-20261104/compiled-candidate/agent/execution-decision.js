import { namesRequestedPlugins } from "./plugin-target-names.js";
/** A user decision ends this request, not the conversation or future requests. */
export function cancelExecution(context, toolName) {
    context.executionDecision = { status: "user_cancelled", toolName };
    return { status: "declined", reason: "user_cancelled", retryable: false };
}
export function assertExecutionOpen(context) {
    if (context.executionDecision)
        throw new Error("CREATOR_REQUEST_DECISION_FINAL: " + context.executionDecision.status);
}
export const removalTargetSchema = {
    type: "object", additionalProperties: false,
    properties: {
        status: { type: "string", enum: ["not_requested", "resolved", "unresolved"] },
        description: { type: "string" },
        pluginIds: { type: "array", items: { type: "string" } },
    }, required: ["status", "description", "pluginIds"],
};
export function parseRemovalTarget(value, plugins) {
    if (!value || Object.keys(value).sort().join() !== "description,pluginIds,status" ||
        !["not_requested", "resolved", "unresolved"].includes(value.status) ||
        typeof value.description !== "string" || value.description.length > 240 ||
        !Array.isArray(value.pluginIds) || new Set(value.pluginIds).size !== value.pluginIds.length ||
        value.pluginIds.some((id) => typeof id !== "string" || !plugins.some(plugin => plugin.pluginId === id)) ||
        (value.status === "resolved" ? value.pluginIds.length === 0 : value.pluginIds.length !== 0) ||
        (value.status === "unresolved" && !value.description.trim()))
        throw Object.assign(new Error("CREATOR_REQUEST_ROUTE_INVALID"), { code: "CREATOR_REQUEST_ROUTE_INVALID" });
    return value;
}
export function removalInstanceIds(input, project) {
    const instances = project.pluginInstances ?? [];
    const removed = new Set();
    const refs = new Set();
    const locations = new Map(instances.map(instance => [instance.id, instance.target?.slotRef]));
    const visit = (node) => {
        if (!node || typeof node !== "object")
            return;
        if (node.nodeRef)
            refs.add(node.nodeRef);
        for (const child of Object.values(node)) {
            if (Array.isArray(child))
                child.forEach(visit);
            else if (child && typeof child === "object")
                visit(child);
        }
    };
    const find = (node, ref) => {
        if (!node || typeof node !== "object")
            return;
        if (node.nodeRef === ref) {
            visit(node);
            return;
        }
        for (const child of Object.values(node)) {
            if (Array.isArray(child))
                child.forEach(item => find(item, ref));
            else if (child && typeof child === "object")
                find(child, ref);
        }
    };
    for (const item of input.operations ?? []) {
        if (["remove_plugin", "remove_plugin_default", "replace_plugin"].includes(item.type) || (item.type === "set_plugin_enabled" && item.enabled === false))
            removed.add(item.instanceId);
        if (item.type === "move_plugin" && item.target?.type === "layout_slot")
            locations.set(item.instanceId, item.target.slotRef);
        if (item.type === "remove_layout_node") {
            refs.clear();
            find(project.appUIModel?.layout, item.nodeRef);
            // Operator applies a batch in order. Moving an instance out and then
            // deleting its empty old Slot is a layout edit, not feature removal.
            for (const instance of instances)
                if (refs.has(locations.get(instance.id)))
                    removed.add(instance.id);
        }
    }
    return removed;
}
/** Compare exact instance/slot identities, never fuzzy-match a feature in a tool argument. */
export function assertRemovalScope(target, operation, input, project) {
    if (target?.status !== "resolved")
        return;
    const allowed = new Set(target.pluginIds);
    if (operation === "purge_ui_plugin") {
        if (!allowed.has(input.pluginId))
            throw new Error("CREATOR_REMOVAL_TARGET_MISMATCH");
        return;
    }
    if (operation !== "mutate_app_ui_model")
        return;
    const instances = project.pluginInstances ?? [];
    const removed = removalInstanceIds(input, project);
    for (const id of removed) {
        let instance = instances.find(item => item.id === id);
        const visited = new Set();
        while (instance && !allowed.has(instance.pluginId) && instance.target?.parentInstanceId && !visited.has(instance.id)) {
            visited.add(instance.id);
            instance = instances.find(item => item.id === instance.target.parentInstanceId);
        }
        if (!instance || !allowed.has(instance.pluginId))
            throw new Error("CREATOR_REMOVAL_TARGET_MISMATCH");
    }
}
/** Keep a reversible off switch from becoming structural deletion. The
 * Operator still owns the original operation semantics and transaction. */
export function assertInstanceRetention(request, input, project, plugins = project.capabilitySummaries ?? []) {
    const clauses = request.split(/[，。；;,\n]/u).map(clause => clause
        .replace(/(?:不要|不用|不必|别|不)(?:再)?(?:删除|移除|清理|替换|去掉)[^，。；;\n]*/gu, "")
        .replace(/\b(?:do not|don't|without)\s+(?:delete|remove|replace)\b[^,.;\n]*/giu, "")
        .replace(/(?:保留|保持).{0,8}(?:源码|代码|源文件)|(?:源码|代码|源文件).{0,8}(?:保留|保持)/gu, "")
        .replace(/\b(?:keep|preserve)\b.{0,20}\b(?:source|code)\b/giu, ""));
    const removed = [...removalInstanceIds(input, project)];
    if (removed.length && clauses.some(clause => /(?:源码|源文件|\bsource(?:\s+code|\s+files?)?\b)/iu.test(clause) && /删除|移除|清理|永久|彻底|\b(?:delete|remove|purge)\b/iu.test(clause))) {
        throw Object.assign(new Error("CREATOR_PLUGIN_PURGE_CONFIRMATION_REQUIRED: Keep the existing composition until purge_ui_plugin obtains confirmation and removes composition and source atomically."), {
            code: "CREATOR_PLUGIN_PURGE_CONFIRMATION_REQUIRED",
            recovery: { tool: "purge_ui_plugin", pluginIds: [...new Set(removed.map(id => project.pluginInstances?.find((instance) => instance.id === id)?.pluginId).filter(Boolean))], appUIModelHash: input.appUIModelHash },
        });
    }
    const retain = /隐藏|停用|禁用|关掉|关闭|去掉|不想要|不需要|不要(?!改|修改|调整|移动|替换|删除|移除)|\b(?:hide|disable|turn off|don't want|do not want|don't need|do not need)\b/iu;
    const explicitRemoval = /移除|删除|替换|\b(?:remove|delete|replace|purge)\b/iu;
    if (!clauses.some(clause => retain.test(clause)))
        return;
    const destructive = (input.operations ?? []).filter((item) => ["remove_plugin", "remove_plugin_default", "remove_layout_node"].includes(item.type));
    const ids = [...removalInstanceIds({ operations: destructive }, project)].filter(id => {
        const pluginId = project.pluginInstances?.find((instance) => instance.id === id)?.pluginId;
        const plugin = plugins.find(item => item.pluginId === pluginId);
        return !clauses.some(clause => explicitRemoval.test(clause) &&
            ((plugin && namesRequestedPlugins(clause, [plugin])) || !plugins.some(item => namesRequestedPlugins(clause, [item]))));
    });
    if (!ids.length)
        return;
    throw Object.assign(new Error("CREATOR_PLUGIN_INSTANCE_RETENTION_REQUIRED: Disable the existing instances with set_plugin_enabled instead of removing them; retain their identity, position and child configuration."), {
        code: "CREATOR_PLUGIN_INSTANCE_RETENTION_REQUIRED",
        recovery: { appUIModelHash: input.appUIModelHash, operations: ids.map(instanceId => ({ type: "set_plugin_enabled", instanceId, enabled: false })) },
    });
}
//# sourceMappingURL=execution-decision.js.map