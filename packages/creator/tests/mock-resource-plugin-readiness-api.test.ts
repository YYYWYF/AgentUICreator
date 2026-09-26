import { createServer, type Server } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { CreatorMockService } from "../src/mock/CreatorMockService.js";
import { handleCreatorMockRequest } from "../src/mock/mock-api.js";

const servers: Server[] = [];
const services: CreatorMockService[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.dispose()));
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); })));
});

it.each([
  { resourceId: "frontend-tool-form", scenarioId: "frontend-tool-fill-form" },
  { resourceId: "frontend-tool-dialog", scenarioId: "frontend-tool-open-dialog" },
])("rejects $resourceId after its Provider is disabled and allows selection after resource repair", async ({ resourceId, scenarioId }) => {
  const service = new CreatorMockService(); services.push(service);
  const sourceItemId = `demo/${resourceId}`;
  const pluginId = `${resourceId}-demo`;
  let enabled = false;
  const installResources = vi.fn(async (_projectId: string, _sourceItemId: string) => { enabled = true; });
  const inspector = vi.fn(async () => ({
    composition: {
      pluginSources: [{ pluginId, status: "available" as const, dataMessageUINames: [] }],
      pluginInstances: [{ id: "provider", pluginId, enabled, effectiveEnabled: enabled, target: { type: "layout_slot" } }],
    },
    sources: { items: [{ id: sourceItemId, status: "managed", resolvedRequirements: [] }] },
  }));
  const server = createServer((request, response) => { void handleCreatorMockRequest(request, response, service,
    () => ({ id: "project", projectRoot: "/mock-resource-project" }), undefined, inspector, installResources); });
  servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing server address");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (route: string, body: unknown) => fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const initial = await (await fetch(`${base}/compatibility`)).json();
  expect(initial.requirements.find((item: { id: string }) => item.id === resourceId)).toMatchObject({ sourceItemId, plugin: { id: pluginId }, status: "disabled" });
  const denied = await post("/select", { scenarioId, speed: 0 });
  expect(denied.status).toBe(400);
  expect((await denied.json()).error).toContain("请先安装");
  expect(service.getState().scenarioId).not.toBe(scenarioId);
  expect(installResources).not.toHaveBeenCalled();
  const repaired = await post("/install-resources", { projectId: "project", sourceItemId });
  expect(repaired.status).toBe(200);
  expect(installResources).toHaveBeenCalledTimes(1);
  expect(installResources).toHaveBeenCalledWith("project", sourceItemId);
  expect((await repaired.json()).requirements.find((item: { id: string }) => item.id === resourceId)).toMatchObject({ status: "ready" });
  const selected = await post("/select", { scenarioId, speed: 0 });
  expect(selected.status).toBe(200);
  expect(await selected.json()).toMatchObject({ scenarioId });
});
