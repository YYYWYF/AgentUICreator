import { handleUIOperatorRequest } from "@za38.03/agent-ui-creator/project/dev";
import { inspectScenarioResources, mergeOptionalResourceInspection } from "@za38.03/agent-ui-creator/project/resources";
import type { MockProjectInspector } from "./demo-compatibility.js";

/** Use the same public Operator boundary as the standalone Creator host. */
export const inspectMockProjectThroughOperator: MockProjectInspector = async target => {
  const composition = await handleUIOperatorRequest({ operation: "inspect_ui_project", input: { view: "composition" } }, target.projectRoot);
  const sources = await handleUIOperatorRequest({ operation: "inspect_agent_ui_sources", input: {} }, target.projectRoot);
  if (!composition.ok || !sources.ok) {
    const failure = !composition.ok ? composition.error : !sources.ok ? sources.error : undefined;
    throw Object.assign(new Error("CREATOR_WORKSPACE_INSPECTION_FAILED"), { code: failure?.code });
  }
  const result = { composition: composition.result, sources: sources.result } as Awaited<ReturnType<MockProjectInspector>>;
  return { ...result, sources: await mergeOptionalResourceInspection(result.sources, await inspectScenarioResources(target.projectRoot)) };
};
