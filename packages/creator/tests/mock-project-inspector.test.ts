import { beforeEach, expect, it, vi } from "vitest";

const operations = vi.hoisted(() => ({ request: vi.fn(), resources: vi.fn(), merge: vi.fn() }));
// These public subpaths share one installed Operator module.
vi.mock("@za38.03/agent-ui-creator/project/dev", () => ({ handleUIOperatorRequest: operations.request, inspectScenarioResources: operations.resources, mergeOptionalResourceInspection: operations.merge }));
vi.mock("@za38.03/agent-ui-creator/project/resources", () => ({ handleUIOperatorRequest: operations.request, inspectScenarioResources: operations.resources, mergeOptionalResourceInspection: operations.merge }));
import { inspectMockProjectThroughOperator } from "../src/mock/project-inspector.js";

beforeEach(() => { vi.resetAllMocks(); });

it("inspects through public operations without requiring a project-local script", async () => {
  const projectRoot = "C:\\客户 项目\\agent";
  const composition = { pluginInstances: [] }, sources = { items: [] }, optional = { items: [{ id: "optional" }] };
  operations.request.mockResolvedValueOnce({ ok: true, result: composition }).mockResolvedValueOnce({ ok: true, result: sources });
  operations.resources.mockResolvedValue(optional); operations.merge.mockResolvedValue(optional);
  await expect(inspectMockProjectThroughOperator({ id: "workspace", projectRoot })).resolves.toEqual({ composition, sources: optional });
  expect(operations.request.mock.calls).toEqual([
    [{ operation: "inspect_ui_project", input: { view: "composition" } }, projectRoot],
    [{ operation: "inspect_agent_ui_sources", input: {} }, projectRoot],
  ]);
  expect(operations.resources).toHaveBeenCalledWith(projectRoot);
  expect(operations.merge).toHaveBeenCalledWith(sources, optional);
});

it("preserves an Operator failure instead of reporting resources as ready", async () => {
  operations.request.mockResolvedValueOnce({ ok: false, error: { code: "CREATOR_OPERATOR_RESTART_REQUIRED" } }).mockResolvedValueOnce({ ok: true, result: { items: [] } });
  await expect(inspectMockProjectThroughOperator({ id: "workspace", projectRoot: "/target" })).rejects.toMatchObject({ code: "CREATOR_OPERATOR_RESTART_REQUIRED" });
  expect(operations.resources).not.toHaveBeenCalled(); expect(operations.merge).not.toHaveBeenCalled();
});
