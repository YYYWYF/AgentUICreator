import { createServer, Server, type IncomingMessage, type ServerResponse } from "node:http";
import { HttpAgent } from "@ag-ui/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatorMockService, DEFAULT_CREATOR_MOCK_PORT } from "../src/mock/CreatorMockService.js";
import { createCreatorDevServerPlugin } from "../src/vitePlugin.js";
import { CREATOR_MOCK_API_PATH } from "../src/mock/types.js";
import { handleCreatorMockRequest } from "../src/mock/mock-api.js";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const services: CreatorMockService[] = [];
const controlServers: Server[] = [];
const temporaryRoots: string[] = [];
function service() { const value = new CreatorMockService({ port: 0 }); services.push(value); return value; }
async function isolateDefaultPort() {
  const reservation = createServer();
  await new Promise<void>(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("Missing reserved port");
  const port = address.port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const listen = Server.prototype.listen;
  // Exercise the actual default selection without claiming a developer's port.
  const requested: unknown[] = [];
  vi.spyOn(Server.prototype, "listen").mockImplementation(function (this: Server, ...args: unknown[]) {
    if (args[0] === DEFAULT_CREATOR_MOCK_PORT) { requested.push(args[0]); args[0] = port; }
    return Reflect.apply(listen, this, args);
  });
  return { port, requested };
}
afterEach(async () => {
  await Promise.all(services.splice(0).map((value) => value.dispose()));
  await Promise.all(controlServers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve()); server.closeAllConnections();
  })));
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  vi.restoreAllMocks();
});
const input = { threadId: "mock-thread", runId: "mock-run", state: {}, messages: [], tools: [], context: [], forwardedProps: {} };

describe("Creator independent local Mock service", () => {
  it("keeps the default port across restarts and instances without falling back when occupied", async () => {
    const { port, requested } = await isolateDefaultPort();
    const mock = new CreatorMockService();
    const next = new CreatorMockService();
    services.push(mock, next);
    const started = await mock.start();
    expect(started.endpoint).toBe(`http://127.0.0.1:${port}/agent`);
    expect(requested).toEqual([47831]);
    await expect(next.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    expect(next.getState()).toMatchObject({ status: "stopped", endpoint: null });
    await mock.stop();
    expect((await mock.start()).endpoint).toBe(started.endpoint);
    await mock.dispose();
    expect((await next.start()).endpoint).toBe(started.endpoint);
  });

  it("starts once under concurrent requests and releases its port on stop", async () => {
    const mock = service();
    expect(mock.getState().status).toBe("stopped");
    const [a, b] = await Promise.all([mock.start(), mock.start()]);
    expect(a.endpoint).toBe(b.endpoint);
    expect(a.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/agent$/);
    expect(await mock.stop()).toMatchObject({ status: "stopped", endpoint: null });
    await expect(fetch(`${a.endpoint}/scenarios`)).rejects.toThrow();
    expect((await mock.start()).status).toBe("running");
  });

  it("uses the panel-selected Demo through an ordinary AG-UI HttpAgent", async () => {
    const mock = service();
    mock.select("simple-chat", 0);
    const { endpoint } = await mock.start();
    const agent = new HttpAgent({ url: endpoint!, threadId: "demo-client" });
    await agent.runAgent();
    expect(agent.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "assistant", content: "你好，这是一个纯文本流式回复。" }),
    ]));
    const catalog = await (await fetch(`${endpoint}/scenarios`)).json();
    expect(catalog.defaultScenarioId).toBe("simple-chat");
    expect(catalog.scenarios.length).toBeGreaterThan(10);
    mock.select("reasoning-chat", 0);
    const response = await fetch(endpoint!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const events = await response.text();
    expect(events).toContain("REASONING_MESSAGE_CONTENT");
    expect(events).toContain("RUN_FINISHED");
    expect(events).not.toContain("你好，这是一个纯文本流式回复。");
  });

  it("supports local cross-port browser requests and rejects external origins", async () => {
    const mock = service();
    const { endpoint } = await mock.start();
    const preflight = await fetch(endpoint!, {
      method: "OPTIONS", headers: { Origin: "http://localhost:5176", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:5176");
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
    expect((await fetch(`${endpoint}/scenarios`, { headers: { Origin: "https://example.com" } })).status).toBe(403);
    expect((await fetch(endpoint!, { method: "POST", headers: { Origin: "http://127.0.0.1:5176", "Content-Type": "application/json" }, body: "{}" })).status).toBe(400);
    expect((await fetch(endpoint!.replace("/agent", "/unknown"))).status).toBe(404);
  });

  it("stops an active SSE stream and cannot restart after Creator disposal", async () => {
    const mock = service();
    mock.select("simple-chat", 10);
    const { endpoint } = await mock.start();
    const response = await fetch(endpoint!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const reader = response.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    await mock.dispose();
    expect(mock.getState().status).toBe("stopped");
    await expect(mock.start()).rejects.toThrow("Creator 已退出");
    reader.releaseLock();
  });

  it("stops the service when the owning Creator development server closes", async () => {
    await isolateDefaultPort();
    const callbacks: Array<() => void> = [];
    let middleware: ((request: IncomingMessage, response: ServerResponse) => void) | undefined;
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "mock-owner-"));
    temporaryRoots.push(projectRoot);
    const plugin = createCreatorDevServerPlugin({ projectRoot, runtime: { environment: {}, log: () => undefined } });
    const configure = plugin.configureServer as (server: unknown) => void;
    configure({
      httpServer: { once: (_event: string, listener: () => void) => callbacks.push(listener) },
      watcher: { once: (_event: string, listener: () => void) => callbacks.push(listener) },
      middlewares: { use: (route: string, listener: typeof middleware) => { if (route === CREATOR_MOCK_API_PATH) middleware = listener; } },
    });
    const control = createServer((request, response) => middleware!(request, response));
    controlServers.push(control);
    await new Promise<void>((resolve, reject) => {
      control.once("error", reject);
      control.listen(0, "127.0.0.1", resolve);
    });
    const address = control.address();
    if (address === null || typeof address === "string") throw new Error("Missing control address");
    const base = `http://127.0.0.1:${address.port}`;
    const started = await (await fetch(`${base}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
    expect(started.status).toBe("running");
    callbacks[0]!();
    await expect.poll(async () => (await (await fetch(base)).json()).status).toBe("stopped");
    await expect(fetch(`${started.endpoint}/scenarios`)).rejects.toThrow();
    callbacks[1]!();
  });

  it("validates panel selections and keeps service settings while stopped", () => {
    const mock = service();
    expect(() => mock.select("unknown", 1)).toThrow();
    for (const id of ["resumable-long-run", "resumable-agent-plan"]) {
      expect(mock.getState().scenarios.some(scenario => scenario.id === id)).toBe(false);
      expect(() => mock.select(id, 1)).toThrow();
    }
    expect(() => mock.select("simple-chat", Number.NaN)).toThrow();
    expect(() => mock.select("simple-chat", -1)).toThrow();
    expect(() => mock.select("simple-chat", "1")).toThrow();
    expect(mock.select("simple-chat", 0.5)).toMatchObject({ status: "stopped", scenarioId: "simple-chat", speed: 0.5 });
  });

  it("controls the independent service through the Creator HTTP API", async () => {
    const mock = service();
    const server = createServer((request, response) => { void handleCreatorMockRequest(request, response, mock); });
    controlServers.push(server);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Missing control server address");
    const base = `http://127.0.0.1:${address.port}`;
    const post = (route: string, data = {}) => fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    expect(await (await fetch(base)).json()).toMatchObject({ status: "stopped" });
    expect(await (await post("/select", { scenarioId: "simple-chat", speed: 0 })).json()).toMatchObject({ scenarioId: "simple-chat" });
    const started = await (await post("/start")).json();
    expect(started.status).toBe("running");
    expect(new URL(started.endpoint).port).not.toBe(String(address.port));
    expect((await post("/select", { scenarioId: "unknown", speed: 0 })).status).toBe(400);
    expect((await fetch(`${base}/stop`, { method: "POST", body: "{}" })).status).toBe(415);
    expect((await fetch(`${base}/stop`, { method: "POST", headers: { Origin: "https://example.com", "Content-Type": "application/json" }, body: "{}" })).status).toBe(403);
    expect(await (await post("/stop")).json()).toMatchObject({ status: "stopped", endpoint: null });
  });
});
