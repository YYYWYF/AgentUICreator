import { showcaseMockScenarios, type MockScenario } from "@agent-ui/mock-agent";
import { resolveOfficialResource, inspectOfficialResourceImplementation, type ResourceCompositionInspection, type ResourceSourceInspection } from "@agent-ui/project-control/resources";

export interface MockProjectTarget { id: string; projectRoot: string; sourceRoot?: string }
export interface MockDemoCompatibility {
  canInstall?: boolean;
  canInstallResources?: boolean;
  projectId: string | null;
  status: "checked" | "unknown";
  requirements: MockDemoRequirement[];
}
export interface MockDemoRequirement {
  id: string;
  name: string;
  scenarioIds: string[];
  status: "ready" | "missing" | "disabled" | "conflict";
  installable: boolean;
  issue?: { code: "RESOURCE_NOT_INSTALLED" | "RESOURCE_DISABLED" | "RESOURCE_CONFLICT" | "RESOURCE_INSTALL_FAILED"; message: string };
}
export interface MockDemoResource { id: string; name: string; scenarioIds: string[] }

/** Scenarios declare capability IDs; the Official Catalog owns every definition. */
export function collectScenarioResourceRequirements(scenarios: readonly MockScenario[]): MockDemoResource[] {
  const byId = new Map<string, MockDemoResource>();
  for (const scenario of scenarios) for (const id of scenario.resources ?? []) {
    const resource = resolveOfficialResource(id);
    const existing = byId.get(id);
    if (existing) { if (!existing.scenarioIds.includes(scenario.id)) existing.scenarioIds.push(scenario.id); }
    else byId.set(id, { id, name: resource.label, scenarioIds: [scenario.id] });
  }
  return [...byId.values()];
}
export const mockDemoRequirements: readonly MockDemoResource[] = collectScenarioResourceRequirements(showcaseMockScenarios);
export const installableMockResourceIds: ReadonlySet<string> = new Set(mockDemoRequirements.map(resource => resource.id));

export type ProjectCompositionInspection = ResourceCompositionInspection;
export type AgentUISourceInspection = ResourceSourceInspection;
export type MockProjectInspector = (target: MockProjectTarget) => Promise<{ composition: ProjectCompositionInspection; sources: AgentUISourceInspection }>;

/** Whitelist projection: implementation metadata never enters the ordinary API. */
export function inspectMockDemoCompatibility(composition: ProjectCompositionInspection, sources: AgentUISourceInspection, projectId: string | null = null, resources: readonly MockDemoResource[] = mockDemoRequirements): MockDemoCompatibility {
  return { projectId, status: "checked", requirements: resources.map(requirement => {
    const resource = resolveOfficialResource(requirement.id);
    const { status } = inspectOfficialResourceImplementation(resource, composition, sources);
    const issue = status === "ready" ? undefined : status === "conflict"
      ? { code: "RESOURCE_CONFLICT" as const, message: `${resource.label} 资源与当前项目存在兼容性冲突。` }
      : status === "disabled" ? { code: "RESOURCE_DISABLED" as const, message: `${resource.label} 资源未启用或未正确放置。` }
      : { code: "RESOURCE_NOT_INSTALLED" as const, message: `当前项目尚未安装 ${resource.label} 资源。` };
    return { id: resource.id, name: resource.label, scenarioIds: [...requirement.scenarioIds], status, installable: status !== "conflict", ...(issue ? { issue } : {}) };
  }) };
}

export async function inspectMockProjectCompatibility(target: MockProjectTarget | undefined, inspector: MockProjectInspector): Promise<MockDemoCompatibility> {
  if (!target) return { projectId: null, status: "unknown", requirements: [] };
  try {
    const { composition, sources } = await inspector(target);
    return inspectMockDemoCompatibility(composition, sources, target.id);
  } catch {
    return { projectId: target.id, status: "unknown", requirements: [] };
  }
}
