import { createMockConversationApiHandler, type MockConversationApiHandler } from "@agent-ui/mock-agent";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ConnectionStore } from "./connection-store.js";
import { forwardAgentRequest } from "./connected-agent-proxy.js";
import { CONNECTION_API, AGENT_PROXY, BACKEND_PROXY, MOCK_DATA } from "./types.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
export interface ConnectionWorkspace { id: string; projectRoot: string }
export function createConnectionHandler(getWorkspace: () => ConnectionWorkspace | undefined, handleMock?: (request: IncomingMessage, response: ServerResponse) => Promise<void>) {
  const mockHistory = new Map<string, MockConversationApiHandler>();
  const activity = new Map<string, { runs: number; saving: boolean }>();
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? "/", "http://creator.local");
    const connection = url.pathname === CONNECTION_API;
    const run = url.pathname === AGENT_PROXY;
    const mock = url.pathname === "/__agent-ui/mock";
    const mockData = url.pathname === MOCK_DATA || url.pathname.startsWith(`${MOCK_DATA}/`);
    const backend = url.pathname.startsWith(`${BACKEND_PROXY}/`);
    if (!connection && !run && !backend && !mock && !mockData) { next(); return; }
    const json = (status: number, value: unknown) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(value)); };
    try {
      const workspace = getWorkspace();
      if (!workspace || request.headers[CREATOR_WORKSPACE_ID_HEADER] !== workspace.id) { json(409, { error: "Preview workspace changed. Reload the preview." }); return; }
      const status = activity.get(workspace.id) ?? { runs: 0, saving: false };
      activity.set(workspace.id, status);
      const store = new ConnectionStore(workspace.projectRoot);
      if (connection) {
        if (request.method === "GET") { json(200, { ...await store.read(), running: status.runs > 0 }); return; }
        if (request.method !== "POST") { json(405, { error: "Method not allowed." }); return; }
        if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) { json(403, { error: "Connection changes require same-origin requests." }); return; }
        if (status.runs || status.saving) { json(409, { error: "Stop the current run before switching Agent source." }); return; }
        status.saving = true;
        try {
          let body = "";
          for await (const chunk of request) { body += chunk.toString(); if (body.length > 8192) throw new Error("Connection request is too large."); }
          const current = getWorkspace();
          if (current?.id !== workspace.id) throw new Error("Workspace changed.");
          const previous = await store.read();
          const input = JSON.parse(body);
          json(200, await store.save({ ...(previous.endpoint ? { endpoint: previous.endpoint } : {}), ...input }));
        } finally { status.saving = false; }
        return;
      }
      if (mockData) {
        const state = await store.read();
        if (state.activeSource !== "mock") { json(409, { error: "Mock Agent is not selected." }); return; }
        let handler = mockHistory.get(workspace.id);
        if (!handler) { handler = createMockConversationApiHandler({ endpoint: MOCK_DATA }); mockHistory.set(workspace.id, handler); }
        response.setHeader("Cache-Control", "no-store");
        if (!await handler(request, response)) json(404, { error: "Unknown Mock history route." });
        return;
      }
      if (status.saving) { json(409, { error: "Agent connection is being updated." }); return; }
      // Reserve before async I/O so a concurrent settings write cannot change the target.
      status.runs++;
      try {
        const state = await store.read();
        if (mock) {
          if (state.activeSource !== "mock" || !handleMock) { json(409, { error: "Mock Agent is not selected." }); return; }
          await handleMock(request, response); return;
        }
        if (state.activeSource !== "connected" || !state.endpoint) { json(409, { error: "Connected Agent is not selected." }); return; }
        const target = new URL(state.endpoint);
        if (backend) {
          const productPath = url.pathname.slice(BACKEND_PROXY.length);
          if (productPath.startsWith("//") || productPath.includes("\\")) throw new Error("Invalid backend path.");
          target.pathname = productPath;
          target.search = url.search;
        } else {
          for (const [key, value] of url.searchParams) target.searchParams.append(key, value);
        }
        await forwardAgentRequest(request, response, target);
      } finally { status.runs--; }
    } catch (error) {
      if (!response.headersSent) json(400, { error: error instanceof Error ? error.message : "Invalid Agent connection." });
      else response.destroy();
    }
  };
}
