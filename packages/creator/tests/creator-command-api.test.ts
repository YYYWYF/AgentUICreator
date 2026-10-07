import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@agent-ui/project-control/commands", () => ({
  getAvailableAgentUIThemes: vi.fn(async () => ({ current: "light", options: [{ id: "light" }, { id: "violet" }] })),
  setAgentUITheme: vi.fn(),
}));
import { createCreatorCommandHandler } from "../src/commands/command-api.js";
import type { CreatorWorkspaceManager } from "../src/workspace/CreatorWorkspaceManager.js";
import { setAgentUITheme } from "@agent-ui/project-control/commands";
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { vi.clearAllMocks(); await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
async function host(active = false) {
  const workspaces = { hasActiveCreatorRequests: () => active, runProjectOperation: async (id: string, run: (root: string) => unknown) => { if (id !== "project-1") throw new Error("CREATOR_WORKSPACE_CHANGED"); return run("/project"); } } as unknown as CreatorWorkspaceManager;
  const server = createServer(createCreatorCommandHandler(workspaces, undefined, undefined)); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
it("returns authoritative project themes", async () => {
  const base = await host();
  const response = await fetch(base + "/", { headers: { "x-agent-ui-workspace-id": "project-1" } });
  expect(response.status).toBe(200); expect((await response.json()).commands[0].options).toEqual([{ id: "light" }, { id: "violet" }]);
});
it.each([{}, { "x-agent-ui-workspace-id": "stale" }])("rejects missing or stale workspace identity", async headers => {
  const base = await host(); expect((await fetch(base, { headers })).status).toBe(409);
});
it("rejects unknown commands without reaching ProjectControl", async () => {
  const base = await host();
  const response = await fetch(base + "/execute", { method: "POST", headers: { "Content-Type": "application/json", "x-agent-ui-workspace-id": "project-1" }, body: JSON.stringify({ id: "unknown", args: {} }) });
  expect((await response.json()).code).toBe("UNKNOWN_COMMAND"); expect(setAgentUITheme).not.toHaveBeenCalled();
});
it("rejects mutations while Creator is active", async () => {
  const base = await host(true);
  const response = await fetch(base + "/execute", { method: "POST", headers: { "Content-Type": "application/json", "x-agent-ui-workspace-id": "project-1" }, body: JSON.stringify({ id: "theme", args: { theme: "violet" } }) });
  expect((await response.json()).code).toBe("CREATOR_COMMAND_BUSY"); expect(setAgentUITheme).not.toHaveBeenCalled();
});
it("rejects cross-origin requests", async () => {
  const base = await host(); expect((await fetch(base, { headers: { origin: "https://example.com", "x-agent-ui-workspace-id": "project-1" } })).status).toBe(409);
});
it("uses the same hashed workspace identity as legacy Host Preview", async () => {
  const { createHash } = await import("node:crypto");
  const { realpathSync } = await import("node:fs");
  const root = process.cwd();
  const server = createServer(createCreatorCommandHandler(undefined, root, undefined)); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const id = createHash("sha256").update(realpathSync(root)).digest("hex");
  expect((await fetch(base, { headers: { "x-agent-ui-workspace-id": id } })).status).toBe(200);
  expect((await fetch(base, { headers: { "x-agent-ui-workspace-id": root } })).status).toBe(409);
});
