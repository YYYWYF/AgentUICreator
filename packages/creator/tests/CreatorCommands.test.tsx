// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/ui/workspaceClient.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/ui/workspaceClient.js")>(),
  getWorkspaceState: vi.fn(async () => state),
  refreshWorkspaceProject: vi.fn(async () => state),
  executeCreatorCommand: vi.fn(async () => ({ current: "violet", receipt: { files: [], validations: [] } })),
}));
vi.mock("../src/ui/CreatorPluginUpdates.js", () => ({ CreatorPluginUpdates: () => null }));
vi.mock("../src/ui/MockServicePanel.js", () => ({ MockServicePanel: () => null }));
vi.mock("../src/ui/AgentConnectionPanel.js", () => ({ AgentConnectionPanel: () => null, readAgentConnection: vi.fn(), CONNECTION_CHANGED: "connection" }));
import { CreatorWorkbench } from "../src/ui/CreatorWorkbench.js";
import { executeCreatorCommand } from "../src/ui/workspaceClient.js";
const state = { status: "ready", workspace: { id: "workspace-1", name: "Project", displayPath: "/project" }, project: { mode: "platform", sourceRoot: "src" }, runtime: { status: "ready" } };
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
HTMLElement.prototype.scrollTo = vi.fn();
let root: Root; let container: HTMLDivElement;
const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ commands: [{ id: "theme", kind: "choice", scope: "project", current: "light", options: [{ id: "light" }, { id: "violet" }] }] }), { headers: { "Content-Type": "application/json" } }));
beforeEach(async () => { sessionStorage.clear(); vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); container = document.createElement("div"); document.body.append(container); root = createRoot(container); await act(async () => { root.render(<CreatorWorkbench locale="en-US" previewWorkspaceId="workspace-1">Preview</CreatorWorkbench>); }); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function type(text: string) { const input = container.querySelector("textarea")!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); }); return input; }
async function enter(input: HTMLTextAreaElement) { await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }); }
it("offers command then theme options with keyboard selection", async () => {
  const input = await type("/"); expect(container.textContent).toContain("Change Agent UI theme");
  await enter(input); expect(input.value).toBe("/theme "); expect(container.textContent).toContain("Violet");
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  await enter(input); expect(executeCreatorCommand).toHaveBeenCalledWith("workspace-1", "violet", expect.anything()); expect(input.value).toBe("");
});
it("executes direct syntax without adding command activity to Agent history", async () => {
  const input = await type("/theme violet"); await enter(input);
  expect(container.textContent).toContain("Theme changed to Violet");
  expect(fetchMock.mock.calls.every(call => String(call[0]).includes("commands"))).toBe(true);
  const stored = JSON.parse(sessionStorage.getItem("agent-ui-creator-conversation:workspace-1")!);
  expect(stored.agentMessages).toEqual([]); expect(stored.items.some((item: { kind: string }) => item.kind === "command")).toBe(true);
});
it("unknown slash input never falls back to Agent", async () => {
  await enter(await type("/unknown")); expect(container.textContent).toContain("Unknown command: /unknown");
  expect(executeCreatorCommand).not.toHaveBeenCalled(); expect(fetchMock.mock.calls.every(call => String(call[0]).includes("commands"))).toBe(true);
});
it("Escape closes the picker without losing draft", async () => {
  const input = await type("/th"); expect(container.querySelector('[role="listbox"]')).not.toBeNull();
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelector('[role="listbox"]')).toBeNull(); expect(input.value).toBe("/th");
});
it("invalid direct arguments show an error and retain legal choices without Agent fallback", async () => {
  vi.mocked(executeCreatorCommand).mockRejectedValueOnce(Object.assign(new Error("invalid"), { code: "UNKNOWN_THEME" }));
  const input = await type("/theme invalid"); await enter(input);
  expect(container.textContent).toContain('Unknown theme "invalid"');
  expect(container.querySelector('[role="listbox"]')!.textContent).toContain("Violet");
  expect(fetchMock.mock.calls.every(call => String(call[0]).includes("commands"))).toBe(true);
});
it("natural language still reaches the original Creator Agent transport", async () => {
  await enter(await type("Make the composer narrower"));
  expect(executeCreatorCommand).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls.some(call => !String(call[0]).includes("commands"))).toBe(true);
});
