import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCreatorHostPreviewPlugin } from "../src/host-preview/vite.js";
import { ConnectionStore, validateConnection } from "../src/agent-connection/connection-store.js";
import { createConnectionHandler } from "../src/agent-connection/connection-api.js";
import { resolvePreviewAgentSource } from "../src/agent-connection/source-resolver.js";
import { AGENT_PROXY, BACKEND_PROXY, CONNECTION_API } from "../src/agent-connection/types.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../src/workspace/types.js";
const servers: Server[] = [];
const directories: string[] = [];
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server has no TCP address");
  return `http://127.0.0.1:${address.port}`;
}
async function workspace() {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "agent-connection-"));
  directories.push(projectRoot);
  return { id: "workspace", projectRoot };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});
async function setup(upstream: Server) {
  const origin = await listen(upstream);
  const selected = await workspace();
  const store = new ConnectionStore(selected.projectRoot);
  await store.save({ activeSource: "connected", endpoint: `${origin}/agent?configured=1` });
  const handler = createConnectionHandler(() => selected);
  const creator = await listen(createServer((request, response) => { void handler(request, response, () => { response.writeHead(404); response.end(); }); }));
  return { creator, origin, store, headers: { [CREATOR_WORKSPACE_ID_HEADER]: selected.id } };
}
describe("workspace Agent connection", () => {
  it("retains a local endpoint across Mock selection and restart, ignoring only connection state", async () => {
    const selected = await workspace();
    const store = new ConnectionStore(selected.projectRoot);
    expect((await store.read()).configured).toBe(false);
    await store.save({ activeSource: "mock", endpoint: "http://localhost:8000/agent" });
    expect(await new ConnectionStore(selected.projectRoot).read()).toMatchObject({ configured: true, activeSource: "mock", endpoint: "http://localhost:8000/agent" });
    expect(await readFile(path.join(selected.projectRoot, ".agentui/.gitignore"), "utf8")).toBe("/connection.local.json\n");
    expect((await new ConnectionStore((await workspace()).projectRoot).read()).configured).toBe(false);
  });
  it.each(["file:///tmp/agent", "ftp://localhost/agent", "javascript:alert(1)", "http://user:secret@localhost/agent"])('rejects endpoint %s', endpoint => {
    expect(() => validateConnection({ activeSource: "connected", endpoint })).toThrow();
  });
  it("resolves one runtime and keeps connected history product-owned", () => {
    const mock = resolvePreviewAgentSource({ activeSource: "mock", configured: true, running: false });
    expect(mock.conversationDataEndpointOverride).toBe("/__agent-ui/mock-data");
    const connected = resolvePreviewAgentSource({ activeSource: "connected", endpoint: "http://localhost:8000/agent", configured: true, running: false });
    expect(connected.runtimeEndpoint).toBe(AGENT_PROXY);
    expect(connected.conversationDataEndpointOverride).toBeUndefined();
    expect(connected.identity).not.toBe(mock.identity);
  });
  it("explicitly proxies Mock history from ordinary Hosts to Creator", () => {
    const plugin = createCreatorHostPreviewPlugin({ creatorOrigin: "http://127.0.0.1:1234", workspaceId: "workspace" });
    const configure = plugin.config as (config: object) => { server: { proxy: Record<string, { target: string; headers: Record<string, string> }> } };
    const history = configure({}).server.proxy["/__agent-ui/mock-data"]!;
    expect(history.target).toBe("http://127.0.0.1:1234");
    expect(history.headers[CREATOR_WORKSPACE_ID_HEADER]).toBe("workspace");
  });
  it("Creator serves Mock history without a Host Mock plugin and rejects mismatched sources", async () => {
    const selected = await workspace();
    const store = new ConnectionStore(selected.projectRoot);
    const handler = createConnectionHandler(() => selected);
    const creator = await listen(createServer((request, response) => { void handler(request, response, () => { response.writeHead(404); response.end(); }); }));
    const headers = { [CREATOR_WORKSPACE_ID_HEADER]: selected.id };
    const history = `${creator}/__agent-ui/mock-data/conversations`;
    expect((await fetch(history)).status).toBe(409);
    const list = await fetch(history, { headers });
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect(await list.json()).toMatchObject({ conversations: expect.arrayContaining([expect.objectContaining({ id: "mock-history-basic" })]) });
    expect(await (await fetch(`${history}/mock-history-basic`, { headers })).json()).toMatchObject({ id: "mock-history-basic", state: { values: { messages: expect.any(Array) } } });
    await store.save({ activeSource: "connected", endpoint: "http://localhost:8000/agent" });
    expect((await fetch(history, { headers })).status).toBe(409);
  });
  it("isolates Mock history deletion between workspaces", async () => {
    let selected = await workspace();
    const first = selected;
    const handler = createConnectionHandler(() => selected);
    const creator = await listen(createServer((request, response) => { void handler(request, response, () => { response.writeHead(404); response.end(); }); }));
    const detail = `${creator}/__agent-ui/mock-data/conversations/mock-history-basic`;
    const headers = { [CREATOR_WORKSPACE_ID_HEADER]: first.id };
    expect((await fetch(detail, { method: "DELETE", headers })).status).toBe(204);
    expect((await fetch(detail, { headers })).status).toBe(404);
    selected = { ...await workspace(), id: "second-workspace" };
    expect((await fetch(detail, { headers: { [CREATOR_WORKSPACE_ID_HEADER]: selected.id } })).status).toBe(200);
    selected = first;
    expect((await fetch(detail, { headers })).status).toBe(404);
  });
  it("streams the first chunk before completion, forwards query/body/headers, and locks switching", async () => {
    let finish: (() => void) | undefined;
    const seen: { url?: string; method?: string; body?: string; header?: string } = {};
    const setupResult = await setup(createServer(async (request, response) => {
      seen.url = request.url ?? ""; seen.method = request.method ?? ""; seen.header = String(request.headers["x-product"]);
      let body = ""; for await (const chunk of request) body += chunk;
      seen.body = body;
      response.writeHead(202, { "Content-Type": "text/event-stream", "X-Upstream": "retained", "Cache-Control": "no-store" });
      response.write("data: first\n\n");
      finish = () => response.end("data: last\n\n");
    }));
    const { creator, headers, store } = setupResult;
    const response = await fetch(`${creator}${AGENT_PROXY}?scenario=test&url=http://wrong.invalid`, { method: "POST", headers: { ...headers, "x-product": "kept" }, body: '{"messages":[]}' });
    expect(response.status).toBe(202);
    expect(response.headers.get("x-upstream")).toBe("retained");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("first");
    expect(seen).toMatchObject({ method: "POST", body: '{"messages":[]}', header: "kept" });
    expect(seen.url).toContain("configured=1&scenario=test");
    const switched = await fetch(`${creator}${CONNECTION_API}`, { method: "POST", headers, body: JSON.stringify({ activeSource: "mock" }) });
    expect(switched.status).toBe(409);
    expect((await store.read()).activeSource).toBe("connected");
    finish!();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("last");
    await reader.read();
  });
  it("does not follow redirects, accepts only the current workspace, and never reads a browser target", async () => {
    let calls = 0;
    const { creator, headers } = await setup(createServer((_request, response) => { calls++; response.writeHead(307, { Location: "http://wrong.invalid" }); response.end(); }));
    expect((await fetch(`${creator}${AGENT_PROXY}`, { method: "POST" })).status).toBe(409);
    expect(calls).toBe(0);
    expect((await fetch(`${creator}${AGENT_PROXY}?target=http://wrong.invalid`, { method: "POST", headers })).status).toBe(502);
    expect(calls).toBe(1);
  });
  it("forwards auxiliary paths to the configured origin without adding the Agent path", async () => {
    const { creator, headers } = await setup(createServer((request, response) => { response.end(request.url); }));
    const response = await fetch(`${creator}${BACKEND_PROXY}/api/conversations?page=2`, { headers });
    expect(await response.text()).toBe("/api/conversations?page=2");
  });
  it("propagates downstream cancellation to the upstream stream", async () => {
    let disconnected!: () => void;
    const closed = new Promise<void>(resolve => { disconnected = resolve; });
    const { creator, headers } = await setup(createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" }); response.write("data: first\n\n"); response.on("close", disconnected);
    }));
    const controller = new AbortController();
    const response = await fetch(`${creator}${AGENT_PROXY}`, { method: "POST", headers, signal: controller.signal });
    await response.body!.getReader().read();
    controller.abort();
    await closed;
  });
});
