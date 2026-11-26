import type { IncomingMessage, ServerResponse } from "node:http";

import {
  mockConversationFixtures,
  type MockConversationFixture,
} from "./fixtures.js";
import { mockDurableRuns, type MockDurableRunStore } from "../durable-run-store.js";

export interface MockConversationApiHandlerOptions {
  endpoint?: string | undefined;
  durableStore?: MockDurableRunStore;
  fixtures?: readonly MockConversationFixture[] | undefined;
  listDelayMs?: number | undefined;
  detailDelayMs?: number | undefined;
  pageSize?: number | undefined;
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
  durableStore = mockDurableRuns,
  fixtures = mockConversationFixtures,
  listDelayMs = 400,
  detailDelayMs = 700,
  pageSize,
}: MockConversationApiHandlerOptions = {}): MockConversationApiHandler {
  if (pageSize !== undefined && (!Number.isSafeInteger(pageSize) || pageSize <= 0))
    throw new Error("MOCK_CONVERSATION_PAGE_SIZE_INVALID");
  const baseEndpoint = normalizeEndpoint(endpoint);
  const conversationsEndpoint = `${baseEndpoint}/conversations`;
  const detailsById = new Map(
    fixtures.map((fixture) => [fixture.detail.id, fixture.detail]),
  );
  const deletedIds = new Set<string>();
  const summaries = new Map(fixtures.map(fixture => [fixture.summary.id, { ...fixture.summary }]));

  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://mock-data.local");
    const resumeBase = `${baseEndpoint}/run-resume`;
    if (url.pathname === `${resumeBase}/threads` && request.method === "GET") {
      sendJson(response, 200, { threads: durableStore.list() });
      return true;
    }
    if (url.pathname.startsWith(`${resumeBase}/threads/`) && request.method === "GET") {
      const path = url.pathname.slice(`${resumeBase}/threads/`.length).split("/");
      let id: string;
      try { id = decodeURIComponent(path[0] ?? ""); }
      catch { sendJson(response, 400, { error: "Invalid thread id." }); return true; }
      const snapshot = durableStore.snapshot(id);
      if (snapshot === undefined) { sendJson(response, 404, { error: "Unknown run." }); return true; }
      if (path.length === 1) { sendJson(response, 200, snapshot); return true; }
      if (path.length === 2 && path[1] === "stream") {
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.flushHeaders();
        if (snapshot.scenarioId === "resumable-agent-plan") {
          const unsubscribe = durableStore.subscribeAgentPlanResume(id, event => {
            if (!response.destroyed) response.write(`data: ${JSON.stringify(event)}\n\n`);
          }, () => {
            if (!response.destroyed) response.end();
          });
          response.once("close", unsubscribe);
          return true;
        }
        const unsubscribe = durableStore.subscribeContinuation(id, text => {
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
    const allowed = isList ? ['GET'] : ['GET', 'DELETE', 'PATCH', 'POST'];
    if (!allowed.includes(request.method ?? '')) {
      response.setHeader('Allow', allowed.join(', '));
      sendJson(response, 405, { error: 'CONVERSATION_METHOD_NOT_ALLOWED' });
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
        const items = fixtures
            .filter(fixture => !deletedIds.has(fixture.summary.id))
            .map(fixture => summaries.get(fixture.summary.id)!).concat(durableStore.list()
              .filter(item => !deletedIds.has(item.id))
              .map(({ id, title }) => summaries.get(id) ?? { id, title }));
        const cursor = url.searchParams.get("cursor");
        const offset = cursor === null ? 0 : Number(cursor);
        if (pageSize !== undefined && cursor !== null && (!/^\d+$/.test(cursor) || !Number.isSafeInteger(offset))) {
          sendJson(response, 400, { error: "MOCK_CONVERSATION_CURSOR_INVALID" });
          return true;
        }
        const page = pageSize === undefined ? items : items.slice(offset, offset + pageSize);
        const nextOffset = offset + page.length;
        sendJson(response, 200, {
          returnCode: 'SUC0000', errorMsg: null,
          body: {
            total_conversations: items.length,
            ...(pageSize === undefined ? {} : { next_cursor: nextOffset < items.length ? String(nextOffset) : null }),
            conversations: page.map(item => ({
              thread_id: item.id, title: item.title,
              ...(item.status === undefined ? {} : { status: item.status }),
              ...(item.updatedAt === undefined ? {} : { last_message_time: item.updatedAt }),
            })),
          },
        });
        return true;
      }

      const [encodedId, action, extra] = url.pathname.slice(detailPrefix.length).split('/');
      if (extra !== undefined) { sendJson(response, 404, { error: 'CONVERSATION_ROUTE_NOT_FOUND' }); return true; }
      let id: string;
      try {
        id = decodeURIComponent(encodedId ?? '');
      } catch {
        sendJson(response, 400, { error: "Invalid conversation id." });
        return true;
      }
      const run = durableStore.snapshot(id);
      const detail = detailsById.get(id) ?? (run === undefined ? undefined : {
        id, title: durableStore.list().find(item => item.id === id)!.title,
        history: { format: 'langchain', messages: [
          { id: `${run.runId}-user`, type: "human", content: run.userText },
          { id: `${run.runId}-partial`, type: "ai", content: run.assistantText },
        ] },
      });
      if (detail === undefined) {
        sendJson(response, 404, { error: `Conversation not found: ${id}` });
        return true;
      }
      if (deletedIds.has(id)) {
        sendJson(response, 404, { error: 'CONVERSATION_NOT_FOUND' });
        return true;
      }
      if (action !== undefined && !['archive', 'unarchive'].includes(action)) {
        sendJson(response, 404, { error: 'CONVERSATION_ACTION_NOT_FOUND' });
        return true;
      }
      if ((action !== undefined && request.method !== 'POST') || (action === undefined && request.method === 'POST')) {
        sendJson(response, 405, { error: 'CONVERSATION_METHOD_NOT_ALLOWED' });
        return true;
      }
      if (request.method === 'PATCH') {
        let payload: unknown;
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch { sendJson(response, 400, { error: 'CONVERSATION_BODY_INVALID' }); return true; }
        if (typeof payload !== 'object' || payload === null || !('title' in payload)
          || typeof payload.title !== 'string' || !payload.title.trim()) {
          sendJson(response, 400, { error: 'CONVERSATION_TITLE_INVALID' }); return true;
        }
        summaries.set(id, { ...summaries.get(id), id, title: payload.title });
      }
      if (action !== undefined) {
        summaries.set(id, { ...summaries.get(id), id, title: summaries.get(id)?.title ?? detail.title,
          status: action === 'archive' ? 'archived' : 'regular' });
      }
      if (request.method === "DELETE") {
        deletedIds.add(id);
        response.statusCode = 204;
        response.end();
        return true;
      }
      if (request.method !== 'GET') {
        response.statusCode = 204;
        response.end();
        return true;
      }
      sendJson(response, 200, {
        returnCode: 'SUC0000', errorMsg: null,
        body: {
          thread_id: id, title: summaries.get(id)?.title ?? detail.title,
          max_message_checkpoint: { channel_values: { messages: detail.history.messages } },
          ...('agentState' in detail && detail.agentState !== undefined ? { agentState: detail.agentState } : {}),
        },
      });
      return true;
    } finally {
      request.removeListener("aborted", abort);
      response.removeListener("close", abort);
    }
  };
}
