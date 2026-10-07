import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@agent-ui/project-control/commands", () => ({
  getAvailableAgentUIThemes: vi.fn(async () => ({ current: "light", options: [{ id: "light" }, { id: "violet" }] })),
  setAgentUITheme: vi.fn(),
  synchronizeAgentUIPluginRegistry: vi.fn(async () => ({ changed: true, path: "plugins/registry.generated.ts", pluginIds: [] })),

  inspectIntegrationHost: vi.fn(async () => ({ framework: "react" })),
  planIntegrationRecipe: vi.fn(),
  inspectOfficialAgentUIResourceCatalog: vi.fn(async () => [{ id: "reasoning", label: "Reasoning", status: "missing", installable: true }, { id: "chart-message", label: "Charts", status: "ready", installable: false }]),
  resolveOfficialResource: (id: string) => { if (id === "unknown") throw Object.assign(new Error("unknown"), { code: "RESOURCE_UNKNOWN" }); return { id, discoverable: id !== "demo" }; },
  installOfficialAgentUIResource: vi.fn(async (_root: string, resourceId: string) => ({ resourceId, changed: true, reenabled: false, verification: { status: "passed", errors: [], warnings: [] } })),
}));
import { inspectIntegrationHost, planIntegrationRecipe, installOfficialAgentUIResource, inspectOfficialAgentUIResourceCatalog } from "@agent-ui/project-control/resources";
import { synchronizeAgentUIPluginRegistry } from "@agent-ui/project-control/commands";
import { createCreatorCommandHandler } from "../src/commands/command-api.js";
import type { CreatorWorkspaceManager } from "../src/workspace/CreatorWorkspaceManager.js";
import { setAgentUITheme } from "@agent-ui/project-control/commands";
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { vi.clearAllMocks(); await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
async function host(active = false) {
  const guard = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(payload.action === "acquire" ? { token: "token" } : { released: true }));
  }); servers.push(guard);
  await new Promise<void>(resolve => guard.listen(0, "127.0.0.1", resolve));
  const workspaces = { ensureCreatorRuntime: () => ({ ensureStarted: async () => ({ host: "127.0.0.1", port: (guard.address() as AddressInfo).port, authToken: "token" }) }), hasActiveCreatorRequests: () => active, runProjectOperation: async (id: string, run: (root: string) => unknown) => { if (id !== "project-1") throw new Error("CREATOR_WORKSPACE_CHANGED"); return run("/project"); } } as unknown as CreatorWorkspaceManager;
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

async function execute(base: string, data: unknown) { return fetch(base + "/execute", { method: "POST", headers: { "Content-Type": "application/json", "x-agent-ui-workspace-id": "project-1" }, body: JSON.stringify(data) }); }
it("catalog translates authoritative installability into disabled options", async () => {
  const data = await (await fetch(await host(), { headers: { "x-agent-ui-workspace-id": "project-1" } })).json();
  expect(data.commands.map((command: { id: string }) => command.id)).toEqual(["theme", "install", "sync"]);
  expect(data.commands[1].options[1]).toMatchObject({ disabled: true, status: "installed" });
  expect(inspectOfficialAgentUIResourceCatalog).toHaveBeenCalledWith("/project");
});
it.each([{ id: "install", args: { resourceId: "reasoning", packages: ["bad"] } }, { id: "sync", args: { command: "bad" } }, { id: "install", args: {}, extra: true }])("rejects extra protocol fields", async input => {
  expect((await (await execute(await host(), input)).json()).code).toBe("CREATOR_COMMAND_REQUEST_INVALID");
  expect(installOfficialAgentUIResource).not.toHaveBeenCalled();
});
it.each([["unknown", "RESOURCE_UNKNOWN"], ["demo", "RESOURCE_NOT_DISCOVERABLE"]])("rejects resource %s", async (resourceId, code) => {
  expect((await (await execute(await host(), { id: "install", args: { resourceId } })).json()).code).toBe(code);
  expect(installOfficialAgentUIResource).not.toHaveBeenCalled();
});
it("install returns true validation without a fake transaction; sync stays unverified", async () => {
  const base = await host();
  const installed = await (await execute(base, { id: "install", args: { resourceId: "reasoning" } })).json();
  expect(installed).toMatchObject({ value: "reasoning", changed: true, receipt: { files: [], verification: { status: "changed-and-statically-verified" } } });
  expect(installed.receipt.transaction).toBeUndefined();
  const sync = await (await execute(base, { id: "sync", args: {} })).json();
  expect(sync.receipt.verification.status).toBe("changed-unverified"); expect(sync.receipt.transaction).toBeUndefined();
  expect(synchronizeAgentUIPluginRegistry).toHaveBeenCalledWith("/project");
});
it.each(["install", "sync"])("rejects active Creator for %s", async id => {
  expect((await (await execute(await host(true), { id, args: id === "install" ? { resourceId: "reasoning" } : {} })).json()).code).toBe("CREATOR_COMMAND_BUSY");
});

it("already-ready API installs return a no-op without fake verification or Undo", async () => {
  vi.mocked(installOfficialAgentUIResource).mockResolvedValueOnce({ resourceId: "reasoning", changed: false, reenabled: false });
  const result = await (await execute(await host(), { id: "install", args: { resourceId: "reasoning" } })).json();
  expect(result).toMatchObject({ changed: false, receipt: { validations: [], verification: { status: "no-project-change" } } });
  expect(result.receipt.transaction).toBeUndefined();
});
it("authoritative resource conflicts cannot produce a success receipt", async () => {
  vi.mocked(installOfficialAgentUIResource).mockRejectedValueOnce(Object.assign(new Error("conflict"), { code: "RESOURCE_CONFLICT" }));
  const result = await execute(await host(), { id: "install", args: { resourceId: "reasoning" } });
  expect(result.status).toBe(409); expect((await result.json()).code).toBe("RESOURCE_CONFLICT");
});

it("compatibility install requests use the Host recipe without the producer installer", async () => {
  const detected = { framework: "vue", frameworkVersion: "^3.5.0", toolchain: "vite", candidates: ["src/App.vue"], targetRequired: true as const, recommendedResource: "web-component-bridge" };
  vi.mocked(inspectIntegrationHost).mockResolvedValueOnce(detected);
  vi.mocked(planIntegrationRecipe).mockResolvedValueOnce({ status: "target-required", host: detected });
  const result = await (await execute(await host(), { id: "install", args: { resourceId: "web-component-bridge" } })).json();
  expect(result).toMatchObject({ changed: false, integrationPlan: { status: "target-required", host: { candidates: ["src/App.vue"] } }, receipt: { files: [] } });
  expect(planIntegrationRecipe).toHaveBeenCalledWith("/project");
  expect(installOfficialAgentUIResource).not.toHaveBeenCalled();
});
