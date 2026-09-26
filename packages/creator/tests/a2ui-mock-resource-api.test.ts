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

it.each(["a2ui-interactive-order", "a2ui-form-controls"])("gates %s on the same source resource accepted by the installation API", async scenarioId => {
  const service = new CreatorMockService(); services.push(service);
  let installed = false;
  const installResources = vi.fn(async () => { installed = true; });
  const inspector = vi.fn(async () => ({
    composition: { pluginSources: [], pluginInstances: [] },
    sources: { items: [
      { id: "integration/a2ui", status: installed ? "managed" : "not-installed", dependencies: ["foundation/core", "agent-component/assistant-ui-generative-ui", "integration/generative-ui"], dependencyIssues: [],
        resolvedRequirements: [{ name: "@assistant-ui/react-generative-ui", required: "0.0.21", compatible: true }] },
      { id: "foundation/core", status: "managed" },
      { id: "agent-component/assistant-ui-generative-ui", status: installed ? "managed" : "not-installed" },
      { id: "integration/generative-ui", status: installed ? "managed" : "not-installed" },
    ] },
  }));
  const server = createServer((request, response) => { void handleCreatorMockRequest(request, response, service,
    () => ({ id: "project", projectRoot: "/mock-resource-project" }), undefined, inspector, installResources); });
  servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing server address");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (route: string, body: unknown) => fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const initial = await (await fetch(`${base}/compatibility`)).json();
  expect(initial.requirements.find((item: { id: string }) => item.id === "a2ui")).toMatchObject({ sourceItemId: "integration/a2ui", status: "missing" });
  const denied = await post("/select", { scenarioId, speed: 0 });
  expect(denied.status).toBe(400);
  expect((await denied.json()).error).toContain("请先安装");
  expect(service.getState().scenarioId).not.toBe(scenarioId);
  expect(installResources).not.toHaveBeenCalled();
  const unsupported = await post("/install-resources", { projectId: "project", sourceItemId: "plugin/chart-message" });
  expect(unsupported.status).toBe(400);
  expect((await unsupported.json()).error).toContain("不支持的 Demo 资源包");
  expect(installResources).not.toHaveBeenCalled();
  const installation = await post("/install-resources", { projectId: "project", sourceItemId: "integration/a2ui" });
  expect(installation.status).toBe(200);
  expect(installResources).toHaveBeenCalledTimes(1);
  expect(installResources).toHaveBeenCalledWith("project", "integration/a2ui");
  const compatibility = await installation.json();
  const requirement = compatibility.requirements.find((item: { id: string }) => item.id === "a2ui");
  expect(requirement).toMatchObject({ sourceItemId: "integration/a2ui", status: "ready" });
  expect(requirement.plugin).toBeUndefined();
  expect(compatibility.canInstallResources).toBe(true);
  const selected = await post("/select", { scenarioId, speed: 0 });
  expect(selected.status).toBe(200);
  expect(await selected.json()).toMatchObject({ scenarioId });
});
