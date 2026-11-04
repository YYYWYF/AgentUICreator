import { walk } from "./activity.js";
import { editingProjectIdentity } from "./editing-session.js";
import { creatorContentHash, readCreatorFileState } from "./files/creatorFileState.js";
import { requestOperator } from "./operator.js";
import { stat } from "node:fs/promises";
import path from "node:path";
/** Recheck contents, not mtimes or just the Agent's mutation counter. */
export async function projectCheckIdentity(root, signal) {
    try {
        signal.throwIfAborted();
        const files = [...await walk(root, "", 5000), ...await walk(root, ".agent-ui", 5000, new Set(["creator", "mocks", "visual-observations", "operator"]))].sort();
        const hashes = [await editingProjectIdentity(root)];
        let bytes = 0;
        for (const file of files) {
            signal.throwIfAborted();
            const size = (await stat(path.join(root, file))).size;
            if (size > 1_000_000 || (bytes += size) > 8_000_000)
                return undefined;
            hashes.push([file, (await readCreatorFileState(root, file)).hash]);
        }
        return creatorContentHash(JSON.stringify(hashes));
    }
    catch {
        signal.throwIfAborted();
        // Cache bookkeeping must not introduce a new project-size or read gate.
        return undefined;
    }
}
const inspections = new WeakMap();
export function runtimeObservationNavigation(project) {
    const nodeRef = project.appUIModel?.layout?.nodeRef;
    return { tool: "inspect_runtime_layout", toolGroup: "debugging", enableIfNeeded: { tool: "enable_creator_tools", input: { groups: ["debugging"] } },
        input: nodeRef ? { nodeRefs: [nodeRef] } : {},
        useWhen: "Actual dimensions, wrapping, container structure or mode-attribute locations are needed. Use the live observation instead of tracing framework/npm implementations to guess rendered DOM.",
        coverage: "Fresh rectangles, bounded semantic-region structure, attribute locations and computed layout styles. No text, input values, arbitrary selectors or JavaScript.",
        evidenceBoundary: "Tool availability is not proof that the preview is connected or the goal is satisfied. Explicit geometry outcomes need fresh relevant rectangles before completion; a static pass alone is insufficient. Enable a tool group alone before using its tools." };
}
export async function inspectProject(context, input) {
    // Full inspection may contain installed API/source diagnostics. Only reuse
    // composition metadata, never runtime evidence, permissions or mutations.
    if (input.view !== "composition")
        return requestOperator(context.root, "inspect_ui_project", input, context.signal);
    const identity = await projectCheckIdentity(context.root, context.signal);
    if (identity === undefined)
        return requestOperator(context.root, "inspect_ui_project", input, context.signal);
    const cache = inspections.get(context) ?? new Map();
    inspections.set(context, cache);
    const key = JSON.stringify(input), saved = cache.get(key);
    if (saved?.identity === identity) {
        await context.activity.log("inspection_reused", { operation: "inspect_ui_project", revision: context.activity.revision });
        return structuredClone(await saved.result);
    }
    const pending = (async () => {
        const result = await requestOperator(context.root, "inspect_ui_project", input, context.signal);
        if (identity !== await projectCheckIdentity(context.root, context.signal))
            throw new Error("EDITING_CONTEXT_STALE");
        return result;
    })();
    cache.set(key, { identity, result: pending });
    try {
        return structuredClone(await pending);
    }
    catch (error) {
        if (cache.get(key)?.result === pending)
            cache.delete(key);
        throw error;
    }
}
/** Agent-facing projection only. Operator contracts and full observations stay intact. */
export function projectInspectionSummary(result) {
    const catalog = result.authoringTargetCatalog;
    const actions = result.creatorActions;
    return { ...result,
        ...(catalog ? { authoringTargetCatalog: { ...catalog, candidates: catalog.candidates?.map((item) => {
                    if (item.kind !== "plugin_source")
                        return item;
                    const { description: _description, intents: _intents, ...identity } = item;
                    return identity;
                }) } } : {}),
        ...(actions ? { creatorActions: { ...actions, candidates: actions.candidates?.map((item) => {
                    const { label: _label, description: _description, ...operation } = item;
                    return operation;
                }) } } : {}),
        ...(result.capabilitySummaries ? { capabilitySummaries: result.capabilitySummaries.map((item) => {
                const { authoring: _authoring, currentInstances: _instances, ...capability } = item;
                return capability;
            }) } : {}),
        projection: { kind: "navigation_summary", omitted: ["repeated Plugin authoring descriptions/intents", "action labels/descriptions", "duplicate capability instance placement"],
            fullResult: { tool: "inspect_ui_project", input: { ...(result.view === "composition" ? { view: "composition" } : {}), detail: "full" } },
            pluginDetails: "inspect_ui_plugin returns the selected Plugin's full API, composition and ownership" }, };
}
//# sourceMappingURL=inspection.js.map