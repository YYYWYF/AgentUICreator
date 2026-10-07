import { afterEach, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CreatorMockService } from "../src/mock/CreatorMockService.js";
import { ConnectionStore } from "../src/agent-connection/connection-store.js";
import { createConnectionHandler } from "../src/agent-connection/connection-api.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../src/workspace/types.js";
const servers: Server[] = [];
const services: CreatorMockService[] = [];
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
  await Promise.all(services.splice(0).map(service => service.dispose()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it.each(["resumable-long-run", "resumable-agent-plan"])("isolates %s creation, list, detail and resume across workspaces", async scenario => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const root = await mkdtemp(path.join(tmpdir(), "mock-durable-workspace-"));
  roots.push(root);
  const a = { id: "workspace-A", projectRoot: path.join(root, "A") };
  const b = { id: "workspace-B", projectRoot: path.join(root, "B") };
  await mkdir(a.projectRoot); await mkdir(b.projectRoot);
  let selected = a;
  const mock = new CreatorMockService({ port: 0 }); services.push(mock);
  mock.setProjectResolver(() => selected);
  const handler = createConnectionHandler(() => selected,
    (request, response) => mock.handlePreviewRequest(request, response),
    workspace => mock.getDurableStore(workspace.projectRoot));
  const server = createServer((request, response) => { void handler(request, response, () => { response.writeHead(404); response.end(); }); });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing mock server address");
  const origin = `http://127.0.0.1:${address.port}`;
  const headers = () => ({ [CREATOR_WORKSPACE_ID_HEADER]: selected.id });
  const resume = `${origin}/__agent-ui/mock-data/run-resume/threads`;
  const start = async (runId: string) => {
    const response = await fetch(`${origin}/__agent-ui/mock?scenario=${scenario}`, {
      method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: "same-thread", runId, messages: [], state: {}, tools: [], context: [], forwardedProps: {} }),
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("RUN_STARTED");
    await reader.cancel(); // Disconnect the first transport; the durable run continues.
  };
  await start("run-A");
  expect(await (await fetch(resume, { headers: headers() })).json()).toMatchObject({ threads: [{ id: "same-thread", runCount: 1 }] });
  expect(mock.getDurableStore(a.projectRoot).snapshot("same-thread")).toMatchObject({ runId: "run-A", resumable: true });

  selected = b;
  expect(await (await fetch(resume, { headers: headers() })).json()).toEqual({ threads: [] });
  expect((await fetch(`${resume}/same-thread`, { headers: headers() })).status).toBe(404);
  expect((await fetch(`${resume}/same-thread/stream`, { headers: headers() })).status).toBe(404);
  expect((await fetch(resume, { headers: { [CREATOR_WORKSPACE_ID_HEADER]: a.id } })).status).toBe(409);
  await start("run-B");
  expect(await (await fetch(`${resume}/same-thread`, { headers: headers() })).json()).toMatchObject({ runId: "run-B", runCount: 1 });

  selected = a;
  expect(await (await fetch(`${resume}/same-thread`, { headers: headers() })).json()).toMatchObject({ runId: "run-A", runCount: 1, resumable: true });
  const response = await fetch(`${resume}/same-thread/stream`, { headers: headers() });
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  if (scenario === "resumable-agent-plan") {
    text += decoder.decode((await reader.read()).value);
    expect(text).toContain("ACTIVITY_SNAPSHOT");
  }
  await vi.advanceTimersByTimeAsync(11_000);
  for (;;) { const chunk = await reader.read(); if (chunk.done) break; text += decoder.decode(chunk.value); }
  expect(text).toContain(scenario === "resumable-agent-plan" ? "RUN_FINISHED" : "第二部分完成");
  if (scenario === "resumable-agent-plan") { expect(text).toContain("run-A"); expect(text).not.toContain("run-B"); }
  expect(mock.getDurableStore(a.projectRoot).snapshot("same-thread")).toMatchObject({ runId: "run-A", runCount: 1, resumable: false });
  expect(mock.getDurableStore(b.projectRoot).snapshot("same-thread")).toMatchObject({ runId: "run-B", runCount: 1, resumable: false });
});


it("rejects a stale Mock request if selection changes while reading connection state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mock-durable-stale-")); roots.push(root);
  let selected = { id: "A", projectRoot: root };
  const mock = new CreatorMockService({ port: 0 }); services.push(mock); mock.setProjectResolver(() => selected);
  const handler = createConnectionHandler(() => selected,
    (request, response) => mock.handlePreviewRequest(request, response),
    workspace => mock.getDurableStore(workspace.projectRoot));
  const server = createServer((request, response) => { void handler(request, response, () => response.end()); }); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing server address");
  vi.spyOn(ConnectionStore.prototype, "read").mockImplementationOnce(async () => {
    selected = { id: "B", projectRoot: path.join(root, "B") };
    return { activeSource: "mock", configured: false, running: false };
  });
  const response = await fetch(`http://127.0.0.1:${address.port}/__agent-ui/mock?scenario=resumable-long-run`, {
    method: "POST", headers: { [CREATOR_WORKSPACE_ID_HEADER]: "A", "Content-Type": "application/json" },
    body: JSON.stringify({ threadId: "stale", runId: "stale", messages: [], state: {}, tools: [], context: [] }),
  });
  expect(response.status).toBe(409);
  expect(mock.getDurableStore(root).list()).toEqual([]);
  expect(mock.getDurableStore(selected.projectRoot).list()).toEqual([]);
});
