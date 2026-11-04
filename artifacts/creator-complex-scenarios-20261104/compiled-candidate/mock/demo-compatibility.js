import { showcaseMockScenarios } from "../mock-agent/internal.js";
import { resolveOfficialResource, inspectOfficialResourceImplementation } from "@za38.03/agent-ui-creator/project/resources";
/** Scenarios declare capability IDs; the Official Catalog owns every definition. */
export function collectScenarioResourceRequirements(scenarios) {
    const byId = new Map();
    for (const scenario of scenarios)
        for (const id of scenario.resources ?? []) {
            const resource = resolveOfficialResource(id);
            const existing = byId.get(id);
            if (existing) {
                if (!existing.scenarioIds.includes(scenario.id))
                    existing.scenarioIds.push(scenario.id);
            }
            else
                byId.set(id, { id, name: resource.label, scenarioIds: [scenario.id] });
        }
    return [...byId.values()];
}
export const mockDemoRequirements = collectScenarioResourceRequirements(showcaseMockScenarios);
export const installableMockResourceIds = new Set(mockDemoRequirements.map(resource => resource.id));
/** Whitelist projection: implementation metadata never enters the ordinary API. */
export function inspectMockDemoCompatibility(composition, sources, projectId = null, resources = mockDemoRequirements) {
    return { projectId, status: "checked", requirements: resources.map(requirement => {
            const resource = resolveOfficialResource(requirement.id);
            const { status } = inspectOfficialResourceImplementation(resource, composition, sources);
            const issue = status === "ready" ? undefined : status === "conflict"
                ? { code: "RESOURCE_CONFLICT", message: `${resource.label} 资源与当前项目存在兼容性冲突。` }
                : status === "disabled" ? { code: "RESOURCE_DISABLED", message: `${resource.label} 资源未启用或未正确放置。` }
                    : { code: "RESOURCE_NOT_INSTALLED", message: `当前项目尚未安装 ${resource.label} 资源。` };
            return { id: resource.id, name: resource.label, scenarioIds: [...requirement.scenarioIds], status, installable: status !== "conflict", ...(issue ? { issue } : {}) };
        }) };
}
export async function inspectMockProjectCompatibility(target, inspector) {
    if (!target)
        return { projectId: null, status: "unknown", requirements: [] };
    try {
        const { composition, sources } = await inspector(target);
        return inspectMockDemoCompatibility(composition, sources, target.id);
    }
    catch (error) {
        const restartRequired = error instanceof Error && "code" in error && error.code === "CREATOR_OPERATOR_RESTART_REQUIRED";
        return { projectId: target.id, status: "unknown", requirements: [],
            ...(restartRequired ? { issue: { code: "CREATOR_OPERATOR_RESTART_REQUIRED" } } : {}) };
    }
}
//# sourceMappingURL=demo-compatibility.js.map