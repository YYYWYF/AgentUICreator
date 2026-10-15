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

it.each(["a2ui-interactive-order", "a2ui-form-controls"])("hides deferred scenario %s and rejects direct installation", async scenarioId => {
  const service = new CreatorMockService({ port: 0 }); services.push(service);
  const installResources = vi.fn(async () => {});
  const inspector = async () => ({ composition: { pluginSources: [], pluginInstances: [] }, sources: { items: [] } });
  const server = createServer((request, response) => { void handleCreatorMockRequest(request, response, service,
    () => ({ id: "project", projectRoot: "/mock-resource-project" }), undefined, inspector, installResources); });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing server address");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (route: string, body: unknown) => fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const compatibility = await (await fetch(`${base}/compatibility`)).json();
  expect(compatibility.requirements.some((item: { id: string }) => item.id === "a2ui")).toBe(false);
  expect(service.getState().scenarioId).not.toBe(scenarioId);
  expect(service.getState().scenarios.some(item => item.id === scenarioId)).toBe(false);
  expect((await post("/select", { scenarioId, speed: 0 })).status).toBe(400);
  expect((await post("/install-resources", { projectId: "project", resourceId: "a2ui" })).status).toBe(400);
  expect(installResources).not.toHaveBeenCalled();
});
