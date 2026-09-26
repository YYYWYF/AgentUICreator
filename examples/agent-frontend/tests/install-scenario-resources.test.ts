import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { installScenarioResources, installMockResource } from "../scripts/ui-project/install-scenario-resources";
vi.mock("../scripts/generate-conversation-integration-registry", () => ({ writeGeneratedConversationIntegrationRegistry: vi.fn() }));
vi.mock("../scripts/generate-plugin-registry", () => ({ writeGeneratedPluginRegistry: vi.fn() }));
vi.mock("../scripts/generate-frontend-tool-registry", () => ({ writeGeneratedFrontendToolRegistries: vi.fn() }));
vi.mock("../scripts/verify-ui", () => ({ verifyUIProject: vi.fn(async () => ({ status: "passed" })) }));
vi.mock("../scripts/ui-project/project-mode", () => ({ readAgentUIProjectConfig: vi.fn(async () => ({ config: { version: "2" } })) }));
vi.mock("../scripts/ui-project/agent-ui-project-paths", () => ({
  resolveAgentUIProjectPaths: (root: string) => ({ appUIModelPath: path.join(root, "model.json") }),
  projectControlConfigForPaths: () => ({}),
}));
vi.mock("../scripts/ui-project/source-registry", () => ({
  inspectAgentUISources: vi.fn(async () => ({ stateHash: "hash", items: [{ id: "demo/frontend-tool-form", status: "not-installed", dependencies: [], dependencyIssues: [], resolvedRequirements: [{ name: "react-hook-form", required: "^7", compatible: true }] }] })),
  applyAgentUISourceItem: vi.fn(async () => {
    vi.mocked(inspectAgentUISources).mockResolvedValueOnce({ stateHash: "after", items: [{ id: "demo/frontend-tool-form", status: "managed", dependencies: [], dependencyIssues: [], resolvedRequirements: [] }] } as unknown as Awaited<ReturnType<typeof inspectAgentUISources>>);
  }),
}));
vi.mock("../scripts/ui-project/app-ui-transaction", () => ({ mutateAppUIModel: vi.fn() }));
import { verifyUIProject } from "../scripts/verify-ui";
import { mutateAppUIModel } from "../scripts/ui-project/app-ui-transaction";
import { applyAgentUISourceItem, inspectAgentUISources } from "../scripts/ui-project/source-registry";
import { writeGeneratedPluginRegistry } from "../scripts/generate-plugin-registry";
import { writeGeneratedFrontendToolRegistries } from "../scripts/generate-frontend-tool-registry";
const roots: string[] = [];
afterEach(async () => { vi.clearAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function project() {
  const root = await mkdtemp(path.join(tmpdir(), "scenario-install-")); roots.push(root);
  await writeFile(path.join(root, "model.json"), JSON.stringify({ root: { type: "slot", plugins: [{ id: "surface", pluginId: "conversation-surface", enabled: true }] } }));
  return root;
}
it("installs the bundle, generates both registries and places a visible Form beside the conversation", async () => {
  const root = await project();
  await installScenarioResources(root, "demo/frontend-tool-form");
  expect(applyAgentUISourceItem).toHaveBeenCalledWith(root, { itemId: "demo/frontend-tool-form", expectedStateHash: "hash" }, {});
  expect(writeGeneratedPluginRegistry).toHaveBeenCalledWith(root);
  expect(writeGeneratedFrontendToolRegistries).toHaveBeenCalledWith(root);
  expect(mutateAppUIModel).toHaveBeenCalledWith(root, expect.objectContaining({ operations: [expect.objectContaining({
    type: "insert_layout_relative", anchorRef: "l0", direction: "right", size: "320px",
    node: { type: "panel", child: { type: "slot", plugins: [{ id: "frontend-tool-form-demo-main", pluginId: "frontend-tool-form-demo", enabled: true }] } },
  })] }));
});
it("reports missing dependencies before any source or composition mutation", async () => {
  vi.mocked(inspectAgentUISources).mockResolvedValueOnce({ stateHash: "hash", items: [{ id: "demo/frontend-tool-form", status: "not-installed", dependencies: [], dependencyIssues: [], resolvedRequirements: [{ name: "react-hook-form", required: "^7", compatible: false }] }] } as Awaited<ReturnType<typeof inspectAgentUISources>>);
  await expect(installScenarioResources(await project(), "demo/frontend-tool-form")).rejects.toThrow("react-hook-form ^7");
  expect(applyAgentUISourceItem).not.toHaveBeenCalled();
  expect(writeGeneratedPluginRegistry).not.toHaveBeenCalled();
  expect(mutateAppUIModel).not.toHaveBeenCalled();
});

it("installs a pluginless Integration through the same Mock seam without composition", async () => {
  const root = await project();
  vi.mocked(inspectAgentUISources)
    .mockResolvedValueOnce({ stateHash: "hash", items: [{ id: "integration/react-hook-form", status: "not-installed", dependencies: [], dependencyIssues: [], resolvedRequirements: [] }] } as unknown as Awaited<ReturnType<typeof inspectAgentUISources>>);
  vi.mocked(applyAgentUISourceItem).mockImplementationOnce(async () => {
    vi.mocked(inspectAgentUISources).mockResolvedValueOnce({ stateHash: "after", items: [{ id: "integration/react-hook-form", status: "managed", dependencies: [], dependencyIssues: [], resolvedRequirements: [] }] } as unknown as Awaited<ReturnType<typeof inspectAgentUISources>>);
    return {} as Awaited<ReturnType<typeof applyAgentUISourceItem>>;
  });
  const before = await readFile(path.join(root, "model.json"), "utf8");
  await installMockResource(root, "integration/react-hook-form");
  expect(applyAgentUISourceItem).toHaveBeenCalledWith(root, { itemId: "integration/react-hook-form", expectedStateHash: "hash" }, {});
  expect(writeGeneratedFrontendToolRegistries).toHaveBeenCalledWith(root);
  expect(mutateAppUIModel).not.toHaveBeenCalled();
  expect(verifyUIProject).not.toHaveBeenCalled();
  expect(await readFile(path.join(root, "model.json"), "utf8")).toBe(before);
});
