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
  { resourceId: "frontend-tool-form-demo", scenarioId: "frontend-tool-fill-form" },
  { resourceId: "frontend-tool-dialog-demo", scenarioId: "frontend-tool-open-dialog" },
])("rejects $resourceId after its Provider is disabled and allows selection after resource repair", async ({ resourceId, scenarioId }) => {
  const service = new CreatorMockService({ port: 0 }); services.push(service);
  const sourceItemId = `demo/${resourceId.replace(/-demo$/, "")}`;
  const pluginId = resourceId;
  let enabled = false;
  let projectRoot = "C:\\workspace\\mock-resource-project";
  const installResources = vi.fn(async (_projectId: string, _sourceItemId: string) => { enabled = true; });
  const inspector = vi.fn(async () => ({
    composition: {
      pluginSources: [{ pluginId, status: "available" as const, dataMessageUINames: [] }],
      pluginInstances: [{ id: "provider", pluginId, enabled, effectiveEnabled: enabled, target: { type: "layout_slot" } }],
    },
    sources: { items: [{ id: sourceItemId, status: "managed", owned: true, resolvedRequirements: [] }] },
  }));
  const server = createServer((request, response) => { void handleCreatorMockRequest(request, response, service,
    () => ({ id: "project", projectRoot }), undefined, inspector, installResources); });
  servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing server address");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (route: string, body: unknown) => fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const initial = await (await fetch(`${base}/compatibility`)).json();
  expect(initial.requirements.find((item: { id: string }) => item.id === resourceId)).toMatchObject({ id: resourceId, status: "disabled", installable: true });
  const denied = await post("/select", { scenarioId, speed: 0 });
  expect(denied.status).toBe(400);
  expect((await denied.json()).error).toContain("请先安装");
  expect(service.getState().scenarioId).not.toBe(scenarioId);
  expect(inspector).toHaveBeenCalledTimes(1);
  expect(installResources).not.toHaveBeenCalled();
  const repaired = await post("/install-resources", { projectId: "project", resourceId });
  expect(repaired.status).toBe(200);
  expect(installResources).toHaveBeenCalledTimes(1);
  expect(installResources).toHaveBeenCalledWith("project", resourceId);
  expect((await repaired.json()).requirements.find((item: { id: string }) => item.id === resourceId)).toMatchObject({ status: "ready" });
  const selected = await post("/select", { scenarioId, speed: 0 });
  expect(selected.status).toBe(200);
  expect(await selected.json()).toMatchObject({ scenarioId });
  expect(inspector).toHaveBeenCalledTimes(3);
  expect((await post("/select", { scenarioId, speed: 1 })).status).toBe(200);
  expect(inspector).toHaveBeenCalledTimes(3);

  // External edits take effect after the same compatibility read used by manual refresh.
  enabled = false;
  await fetch(`${base}/compatibility`);
  expect((await post("/select", { scenarioId, speed: 0 })).status).toBe(400);
  expect(inspector).toHaveBeenCalledTimes(4);

  // A new root must never reuse the previous project's result, even with the same ID.
  enabled = true;
  projectRoot = "D:\\workspace\\another-project";
  expect((await post("/select", { scenarioId, speed: 0 })).status).toBe(200);
  expect(inspector).toHaveBeenCalledTimes(5);
});
