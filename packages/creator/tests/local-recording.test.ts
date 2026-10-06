import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer, type Server } from "node:http";
import { handleCreatorMockRequest } from "../src/mock/mock-api.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalMockRecordingStore } from "../src/mock/local-recording-store.js";
import { CreatorMockService } from "../src/mock/CreatorMockService.js";
import type { MockProjectTarget } from "../src/mock/demo-compatibility.js";
const roots: string[] = [];
const controlServers: Server[] = [];
const services: CreatorMockService[] = [];
async function project() { const root = await mkdtemp(path.join(os.tmpdir(), "local-recording-")); roots.push(root); await mkdir(path.join(root, ".agentui/mocks"), { recursive: true }); return root; }
const data = (text = "hello", delay = 0) => [
  { atMs: 0, event: { type: "RUN_STARTED", threadId: "old", runId: "old" } },
  { atMs: delay, event: { type: "TEXT_MESSAGE_START", messageId: "old-message", role: "assistant" } },
  { atMs: delay, event: { type: "TEXT_MESSAGE_CONTENT", messageId: "old-message", delta: text } },
  { atMs: delay, event: { type: "TEXT_MESSAGE_END", messageId: "old-message" } },
  { atMs: delay, event: { type: "RUN_FINISHED", threadId: "old", runId: "old", outcome: { type: "success" } } },
].map(entry => JSON.stringify(entry)).join("\n");
const input = { threadId: "current-thread", runId: "current-run", messages: [], tools: [], context: [], state: {}, forwardedProps: {} };
afterEach(async () => { vi.restoreAllMocks(); for (const server of controlServers.splice(0)) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); for (const service of services.splice(0)) await service.dispose(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe("current-project local recordings", () => {
  it("lists invalid files, caches unchanged data and refreshes edited/deleted files", async () => {
    const root = await project(); const directory = path.join(root, ".agentui/mocks");
    await writeFile(path.join(directory, "good.jsonl"), data());
    await writeFile(path.join(directory, "broken.jsonl"), "{\n");
    const store = new LocalMockRecordingStore();
    expect(await store.list(root)).toEqual([expect.objectContaining({ title: "broken", status: "invalid", error: expect.stringContaining("Line 1") }), expect.objectContaining({ title: "good", status: "ready", eventCount: 5 })]);
    const first = await store.get(root, "local:good.jsonl");
    expect(await store.get(root, "local:good.jsonl")).toBe(first);
    await writeFile(path.join(directory, "good.jsonl"), data("changed"));
    expect(await store.get(root, "local:good.jsonl")).not.toBe(first);
    await rm(path.join(directory, "good.jsonl"));
    expect(await store.get(root, "local:good.jsonl")).toBeUndefined();
    expect(await store.get(root, "local:../escape.jsonl")).toBeUndefined();
  });
  it("rejects symlink files and directories outside the selected project", async () => {
    const root = await project(); const other = await project();
    await writeFile(path.join(other, ".agentui/mocks/external.jsonl"), data());
    await symlink(path.join(other, ".agentui/mocks/external.jsonl"), path.join(root, ".agentui/mocks/link.jsonl"));
    const store = new LocalMockRecordingStore();
    expect((await store.list(root))[0]?.status).toBe("invalid");
    await rm(path.join(root, ".agentui/mocks"), { recursive: true });
    await symlink(path.join(other, ".agentui/mocks"), path.join(root, ".agentui/mocks"));
    await expect(store.list(root)).rejects.toThrow("current project");
  });
  it.each(["standalone", "preview"])("replays through the %s SSE endpoint and resets selection on project switch", async mode => {
    const root = await project(); await writeFile(path.join(root, ".agentui/mocks/chat.jsonl"), data());
    let current: MockProjectTarget | undefined = { id: "A", projectRoot: root };
    const service = new CreatorMockService(); services.push(service); service.setProjectResolver(() => current);
    expect((await service.refreshState()).recordings[0]?.status).toBe("ready");
    await service.selectRecording("local:chat.jsonl", 0, "A");
    let endpoint: string;
    if (mode === "standalone") endpoint = (await service.start()).endpoint!;
    else {
      const server = createServer((request, response) => { void service.handlePreviewRequest(request, response); });
      controlServers.push(server);
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing preview address");
      endpoint = `http://127.0.0.1:${address.port}/__agent-ui/mock`;
      expect(service.getState().status).toBe("stopped");
    }
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const events = (await response.text()).trim().split("\n\n").map(line => JSON.parse(line.slice(6)));
    expect(events.map(event => event.type)).toEqual(["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"]);
    expect(events[0]).toMatchObject({ threadId: input.threadId, runId: input.runId });
    expect(events[2]).toMatchObject({ messageId: "current-run:replay:message:1", delta: "hello" });
    current = { id: "B", projectRoot: await project() };
    expect(service.getState()).toMatchObject({ selection: { type: "builtin", id: "reasoning-tool-success" }, recordings: [] });
    await expect(service.selectRecording("local:chat.jsonl", 0, "A")).rejects.toThrow("切换");
  });
  it("exposes recording state and selection through the control API", async () => {
    const root = await project(); await writeFile(path.join(root, ".agentui/mocks/chat.jsonl"), data());
    const service = new CreatorMockService(); services.push(service);
    const server = createServer((request, response) => { void handleCreatorMockRequest(request, response, service, () => ({ id: "A", projectRoot: root })); });
    controlServers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
    const url = `http://127.0.0.1:${address.port}`;
    expect(await (await fetch(url)).json()).toMatchObject({ projectId: "A", recordings: [{ id: "local:chat.jsonl", status: "ready" }] });
    const select = (body: unknown) => fetch(`${url}/select`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await select({ selection: { type: "recording", id: "local:chat.jsonl" }, projectId: "stale", speed: 0 })).status).toBe(400);
    expect(await (await select({ selection: { type: "recording", id: "local:chat.jsonl" }, projectId: "A", speed: 0.5 })).json()).toMatchObject({ selection: { type: "recording", id: "local:chat.jsonl" }, speed: 0.5 });
    expect(await (await select({ selection: { type: "builtin", id: "simple-chat" }, speed: 0 })).json()).toMatchObject({ selection: { type: "builtin", id: "simple-chat" } });
  });
  it("fails if the selected project changes while resolving a recording", async () => {
    const root = await project(); await writeFile(path.join(root, ".agentui/mocks/chat.jsonl"), data());
    let current: MockProjectTarget | undefined = { id: "A", projectRoot: root };
    const service = new CreatorMockService(); services.push(service); service.setProjectResolver(() => current);
    await service.selectRecording("local:chat.jsonl", 0, "A");
    const { endpoint } = await service.start();
    const original = LocalMockRecordingStore.prototype.get;
    vi.spyOn(LocalMockRecordingStore.prototype, "get").mockImplementation(async function (this: LocalMockRecordingStore, root, id) {
      const recording = await original.call(this, root, id); current = undefined; return recording;
    });
    const response = await fetch(endpoint!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("切换");
    expect(service.getState().selection.type).toBe("builtin");
  });
  it("reports deleted selected files before opening SSE", async () => {
    const root = await project(); const file = path.join(root, ".agentui/mocks/chat.jsonl"); await writeFile(file, data());
    const service = new CreatorMockService(); services.push(service); service.setProjectResolver(() => ({ id: "A", projectRoot: root }));
    await service.selectRecording("local:chat.jsonl", 0, "A"); await rm(file);
    const { endpoint } = await service.start();
    const response = await fetch(endpoint!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    expect(response.status).toBe(400); expect((await response.json()).error).toContain("无效");
  });
});
