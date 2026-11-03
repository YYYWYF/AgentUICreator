// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../src/ui/workspaceClient.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/ui/workspaceClient.js")>(),
  getWorkspaceState: vi.fn(), getWorkspaceSetup: vi.fn(),
  validateWorkspaceSetup: vi.fn(), initializeWorkspaceProjectRequest: vi.fn(),
}));
vi.mock("../src/ui/CreatorPluginUpdates.js", () => ({ CreatorPluginUpdates: () => null }));
vi.mock("../src/ui/MockServicePanel.js", () => ({ MockServicePanel: () => null }));

import { CreatorWorkbench } from "../src/ui/CreatorWorkbench.js";
import { getWorkspaceState, getWorkspaceSetup, validateWorkspaceSetup, initializeWorkspaceProjectRequest } from "../src/ui/workspaceClient.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined; document.body.replaceChildren();
  localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function button(container: HTMLElement, text: string) {
  const result = [...container.querySelectorAll("button")].find(node => node.textContent?.includes(text));
  if (!result) throw new Error(`Missing button ${text}`);
  return result;
}

it("keeps the full confirmation flow on an explicit manual-install screen until the user installs", async () => {
  localStorage.clear(); sessionStorage.clear(); HTMLElement.prototype.scrollTo = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ commands: [] })));
  const state = { status: "uninitialized" as const, workspace: { id: "setup-project", name: "Project", displayPath: "/work/My Project" } };
  vi.mocked(getWorkspaceState).mockResolvedValue(state);
  vi.mocked(getWorkspaceSetup).mockResolvedValue({ suggestedSourceRoot: "src/agent-ui", modes: [{ id: "platform", title: "Platform", description: "" }] });
  let prepared = false;
  vi.mocked(validateWorkspaceSetup).mockImplementation(async () => ({
    valid: true, issues: [], sourceRoot: { normalized: "src/agent-ui", parentExists: true, targetState: "missing" },
    dependencyPlan: { id: prepared ? "prepared" : "new", projectRoot: "/work/My Project", packageJsonPath: "/work/My Project/package.json", manager: "pnpm", installCommand: "pnpm install", installRequired: true,
      dependencies: prepared ? {} : { "lucide-react": "1.41.0" }, devDependencies: {},
      packages: [{ name: "lucide-react", version: "1.41.0", required: ["1.41.0"], action: "install" }],
    },
  }));
  vi.mocked(initializeWorkspaceProjectRequest).mockImplementation(async () => { prepared = true; return state; });
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(<CreatorWorkbench>Preview</CreatorWorkbench>); });
  await act(async () => button(container, "工作台").click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
  const content = container.querySelector(".creator-project-setup-content") as HTMLElement;
  content.scrollTop = 500;
  await act(async () => button(container, "确认添加依赖").click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
  expect(initializeWorkspaceProjectRequest).toHaveBeenCalledTimes(1);
  expect(container.querySelector(".creator-install-step-command code")?.textContent).toBe("pnpm install");
  expect(container.querySelector(".creator-install-step .creator-dependency-file-path")?.textContent).toBe("/work/My Project");
  expect(container.textContent).toContain("下一步");
  expect(container.textContent).not.toContain("Creator 服务暂不可用");
  expect(content.scrollTop).toBe(0);
  expect(container.querySelector(".creator-project-setup-fields")?.hasAttribute("hidden")).toBe(true);
  await act(async () => button(container, "重新检查依赖").click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
  expect(initializeWorkspaceProjectRequest).toHaveBeenCalledTimes(1);
  expect(container.querySelector(".creator-install-step-command code")?.textContent).toBe("pnpm install");
});
