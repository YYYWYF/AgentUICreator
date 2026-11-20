// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../src/ui/workspaceClient.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/ui/workspaceClient.js")>(),
  getWorkspaceState: vi.fn(), refreshWorkspaceProject: vi.fn(), executeCreatorCommand: vi.fn(),
}));
vi.mock("../src/ui/CreatorPluginUpdates.js", () => ({ CreatorPluginUpdates: () => null }));
vi.mock("../src/ui/MockServicePanel.js", () => ({ MockServicePanel: () => null }));

import { CreatorWorkbench } from "../src/ui/CreatorWorkbench.js";
import { executeCreatorCommand, getWorkspaceState, refreshWorkspaceProject } from "../src/ui/workspaceClient.js";
import type { CreatorCommandResult } from "../src/commands/types.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  document.body.replaceChildren(); localStorage.clear(); sessionStorage.clear();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

it.each([false, true])("runs /takeover through the command menu with approval=%s and never submits to the Agent", async approved => {
  const workspace = { status: "ready" as const, workspace: { id: "project-1", name: "Project", displayPath: "/project" }, project: { mode: "assistant" as const, sourceRoot: "src/ui" }, runtime: { status: "ready" as const } };
  vi.mocked(getWorkspaceState).mockResolvedValue(workspace);
  vi.mocked(refreshWorkspaceProject).mockResolvedValue(workspace);
  const pending: CreatorCommandResult = {
    status: "confirmation-required", changed: false, receipt: { files: [], validations: [] },
    takeover: { id: "confirmed-plan", plan: {
      pluginId: "composer", package: { name: "@za38.03/agent-ui-plugins", version: "7.8.9" }, pluginVersion: "1.2.3",
      catalogHash: "a".repeat(64), stateHash: "b".repeat(64), planHash: "c".repeat(64),
      applicationChanges: ["index.tsx"], files: ["plugins/composer/source/index.tsx"],
      instances: ["composer-main"], sharedDependencies: [], dependencyChanges: [], compatibility: {}, recommendations: [], origins: {},
    } },
  };
  const execute = vi.mocked(executeCreatorCommand).mockReset().mockResolvedValueOnce(pending).mockResolvedValueOnce({ changed: true, value: "composer", receipt: { files: [], validations: [] } });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(approved);
  const fetcher = vi.fn(async (url: string) => {
    if (url !== "/__creator/commands") throw new Error(`Unexpected Agent request: ${url}`);
    return Response.json({ commands: [{ id: "takeover", kind: "choice", scope: "project", options: [{ id: "composer", pluginId: "composer", category: "input" }] }] });
  });
  vi.stubGlobal("fetch", fetcher);
  HTMLElement.prototype.scrollTo = vi.fn();
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(<CreatorWorkbench>Preview</CreatorWorkbench>); });
  const input = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "/takeover ");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const option = container.querySelector<HTMLButtonElement>('[role="option"]')!;
  expect(option.textContent).toContain("composer");
  await act(async () => { option.click(); });
  expect(confirm).toHaveBeenCalledOnce();
  expect(confirm.mock.calls[0]?.[0]).toContain("7.8.9");
  expect(execute.mock.calls[0]?.slice(0, 2)).toEqual(["project-1", { id: "takeover", args: { pluginId: "composer" } }]);
  expect(execute).toHaveBeenCalledTimes(approved ? 2 : 1);
  if (approved) expect(execute.mock.calls[1]?.slice(0, 2)).toEqual(["project-1", { id: "takeover", args: { pluginId: "composer", preparationId: "confirmed-plan" } }]);
  expect(container.textContent).toContain(approved ? "已接管源码" : "已取消，未提取源码");
  expect(fetcher.mock.calls.every(([url]) => url === "/__creator/commands")).toBe(true);
});
