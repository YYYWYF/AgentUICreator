import type { IncomingMessage, ServerResponse } from "node:http";

import {
  mockConversationFixtures,
  type MockConversationFixture,
} from "./fixtures.js";
import { mockDurableRuns } from "../durable-run-store.js";

export interface MockConversationApiHandlerOptions {
  endpoint?: string | undefined;
  fixtures?: readonly MockConversationFixture[] | undefined;
  listDelayMs?: number | undefined;
  detailDelayMs?: number | undefined;
}

export type MockConversationApiHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<boolean>;

function normalizeEndpoint(endpoint: string): string {
  if (!endpoint.startsWith("/")) {
    throw new Error("Mock Conversation API endpoint must start with '/'.");
  }
  return endpoint.replace(/\/+$/, "");
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function waitForDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || milliseconds <= 0) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export function createMockConversationApiHandler({
  endpoint = "/__agent-ui/mock-data",
  fixtures = mockConversationFixtures,
  listDelayMs = 400,
  detailDelayMs = 700,
}: MockConversationApiHandlerOptions = {}): MockConversationApiHandler {
  const baseEndpoint = normalizeEndpoint(endpoint);
  const conversationsEndpoint = `${baseEndpoint}/conversations`;
  const detailsById = new Map(
    fixtures.map((fixture) => [fixture.detail.id, fixture.detail]),
  );
  const deletedIds = new Set<string>();

  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://mock-data.local");
    const resumeBase = `${baseEndpoint}/run-resume`;
    if (url.pathname === `${resumeBase}/threads` && request.method === "GET") {
      sendJson(response, 200, { threads: mockDurableRuns.list() });
      return true;
    }
    if (url.pathname.startsWith(`${resumeBase}/threads/`) && request.method === "GET") {
      const path = url.pathname.slice(`${resumeBase}/threads/`.length).split("/");
      let id: string;
      try { id = decodeURIComponent(path[0] ?? ""); }
      catch { sendJson(response, 400, { error: "Invalid thread id." }); return true; }
      const snapshot = mockDurableRuns.snapshot(id);
      if (snapshot === undefined) { sendJson(response, 404, { error: "Unknown run." }); return true; }
      if (path.length === 1) { sendJson(response, 200, snapshot); return true; }
      if (path.length === 2 && path[1] === "stream") {
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.flushHeaders();
        const unsubscribe = mockDurableRuns.subscribeContinuation(id, text => {
          if (!response.destroyed) { response.write(`data: ${JSON.stringify({ text })}\n\n`); response.end(); }
        });
        response.once("close", unsubscribe);
        return true;
      }
      sendJson(response, 404, { error: "Unknown run route." });
      return true;
    }
    const isList = url.pathname === conversationsEndpoint;
    const detailPrefix = `${conversationsEndpoint}/`;
    const isDetail = url.pathname.startsWith(detailPrefix);
    if (!isList && !isDetail) return false;

    if (request.method !== "GET" && !(isDetail && request.method === "DELETE")) {
      response.setHeader("Allow", isList ? "GET" : "GET, DELETE");
      sendJson(response, 405, { error: "Method not allowed for this conversation endpoint." });
      return true;
    }

    const controller = new AbortController();
    const abort = (): void => controller.abort();
    request.once("aborted", abort);
    response.once("close", abort);
    try {
      await waitForDelay(isList ? listDelayMs : detailDelayMs, controller.signal);
      if (controller.signal.aborted || response.destroyed) return true;

      if (isList) {
        sendJson(response, 200, {
          conversations: fixtures
            .filter(fixture => !deletedIds.has(fixture.summary.id))
            .map(fixture => fixture.summary),
        });
        return true;
      }

      let id: string;
      try {
        id = decodeURIComponent(url.pathname.slice(detailPrefix.length));
      } catch {
        sendJson(response, 400, { error: "Invalid conversation id." });
        return true;
      }
      const detail = detailsById.get(id);
      if (detail === undefined) {
        sendJson(response, 404, { error: `Conversation not found: ${id}` });
        return true;
      }
      if (request.method === "DELETE") {
        deletedIds.add(id);
        response.statusCode = 204;
        response.end();
        return true;
      }
      if (deletedIds.has(id)) {
        sendJson(response, 404, { error: `Conversation not found: ${id}` });
        return true;
      }
      sendJson(response, 200, detail);
      return true;
    } finally {
      request.removeListener("aborted", abort);
      response.removeListener("close", abort);
    }
  };
}
