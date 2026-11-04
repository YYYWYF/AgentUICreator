import { type MockScenario } from "../mock-agent/internal.js";
import { type ResourceCompositionInspection, type ResourceSourceInspection } from "@za38.03/agent-ui-creator/project/resources";
export interface MockProjectTarget {
    id: string;
    projectRoot: string;
    sourceRoot?: string;
}
export interface MockDemoCompatibility {
    canInstallResources?: boolean;
    projectId: string | null;
    status: "checked" | "unknown";
    requirements: MockDemoRequirement[];
    issue?: {
        code: "CREATOR_OPERATOR_RESTART_REQUIRED";
    };
}
export interface MockDemoRequirement {
    id: string;
    name: string;
    scenarioIds: string[];
    status: "ready" | "missing" | "disabled" | "conflict";
    installable: boolean;
    issue?: {
        code: "RESOURCE_NOT_INSTALLED" | "RESOURCE_DISABLED" | "RESOURCE_CONFLICT" | "RESOURCE_INSTALL_FAILED";
        message: string;
    };
}
export interface MockDemoResource {
    id: string;
    name: string;
    scenarioIds: string[];
}
/** Scenarios declare capability IDs; the Official Catalog owns every definition. */
export declare function collectScenarioResourceRequirements(scenarios: readonly MockScenario[]): MockDemoResource[];
export declare const mockDemoRequirements: readonly MockDemoResource[];
export declare const installableMockResourceIds: ReadonlySet<string>;
export type ProjectCompositionInspection = ResourceCompositionInspection;
export type AgentUISourceInspection = ResourceSourceInspection;
export type MockProjectInspector = (target: MockProjectTarget) => Promise<{
    composition: ProjectCompositionInspection;
    sources: AgentUISourceInspection;
}>;
/** Whitelist projection: implementation metadata never enters the ordinary API. */
export declare function inspectMockDemoCompatibility(composition: ProjectCompositionInspection, sources: AgentUISourceInspection, projectId?: string | null, resources?: readonly MockDemoResource[]): MockDemoCompatibility;
export declare function inspectMockProjectCompatibility(target: MockProjectTarget | undefined, inspector: MockProjectInspector): Promise<MockDemoCompatibility>;
//# sourceMappingURL=demo-compatibility.d.ts.map