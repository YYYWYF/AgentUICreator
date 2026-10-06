import type { IncomingMessage, ServerResponse } from "node:http";

import { EventSchemas, RunAgentInputSchema, type AGUIEvent, type RunAgentInput } from "@ag-ui/core";

import type { MockScenarioRegistry } from "./scenario-registry.js";
import { runMockScenario } from "./scenario-runner.js";
import { mockDurableRuns, type MockDurableRunStore } from "./durable-run-store.js";

const MAX_REQUEST_BYTES = 1024 * 1024;

export interface MockAgentHttpHandlerOptions {
  registry: MockScenarioRegistry;
  resolveRun?: MockRunResolver;
  /** Run creation and history/resume must share the same development store. */
  durableStore?: MockDurableRunStore;
}

export type MockRunResolver = (
  input: RunAgentInput,
  request: { scenarioId?: string; speed: number; signal: AbortSignal },
) => AsyncIterable<AGUIEvent> | Promise<AsyncIterable<AGUIEvent>>;

export function createScenarioMockRunResolver(registry: MockScenarioRegistry): MockRunResolver {
  return (input, request) => {
    const scenario = request.scenarioId === undefined ? registry.getDefault() : registry.get(request.scenarioId);
    if (!scenario) throw new Error(`Unknown mock scenario: ${request.scenarioId}`);
    return runMockScenario(input, scenario, { signal: request.signal, timingScale: request.speed });
  };
}

export type MockAgentHttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let byteLength = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.byteLength;
    if (byteLength > MAX_REQUEST_BYTES) {
      throw new Error("Mock Agent request exceeds the 1 MiB limit.");
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJsonError(
  response: ServerResponse,
  statusCode: number,
  message: string,
): void {
  if (response.headersSent) {
    response.end();
    return;
  }
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({ error: message }));
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

function parseRequestUrl(request: IncomingMessage): URL {
  return new URL(request.url ?? "/", "http://mock-agent.local");
}

function isScenarioListRequest(url: URL): boolean {
  return url.pathname.endsWith("/scenarios");
}

function parseTimingScale(url: URL): number {
  const value = Number(url.searchParams.get("speed"));
  if (!url.searchParams.has("speed") || !Number.isFinite(value)) return 1;
  return Math.min(10, Math.max(0, value));
}

/** Creates a Node HTTP handler compatible with @ag-ui/client HttpAgent. */
export function createMockAgentHttpHandler({
  registry,
  resolveRun,
  durableStore = mockDurableRuns,
}: MockAgentHttpHandlerOptions): MockAgentHttpHandler {
  const events: Array<{ threadId: string; runId: string; type: string; timestamp: number }> = [];
  return async (request, response) => {
    const requestUrl = parseRequestUrl(request);

    if (requestUrl.pathname.endsWith("/events") && request.method === "GET") {
      sendJson(response, 200, { events });
      return;
    }

    if (isScenarioListRequest(requestUrl)) {
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        sendJsonError(
          response,
          405,
          "Mock Agent scenario list endpoint only accepts GET.",
        );
        return;
      }

      sendJson(response, 200, {
        defaultScenarioId: registry.defaultScenarioId,
        scenarios: registry.list(),
      });
      return;
    }

    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      sendJsonError(response, 405, "Mock Agent endpoint only accepts POST.");
      return;
    }

    const scenarioId = requestUrl.searchParams.get("scenario");
    const scenario = scenarioId === null
      ? registry.getDefault()
      : registry.get(scenarioId);
    if (resolveRun === undefined && scenario === undefined) {
      sendJsonError(response, 404, `Unknown mock scenario: ${scenarioId}`);
      return;
    }

    let parsedBody: unknown;
    try {
      parsedBody = await readJsonBody(request);
    } catch (error) {
      sendJsonError(
        response,
        400,
        error instanceof Error ? error.message : "Invalid JSON request body.",
      );
      return;
    }

    const parsedInput = RunAgentInputSchema.safeParse(parsedBody);
    if (!parsedInput.success) {
      sendJsonError(response, 400, "Request body is not a valid RunAgentInput.");
      return;
    }

    if (resolveRun === undefined && scenario?.durableRun) {
      const durableScenarioId = scenario.id === "resumable-agent-plan"
        ? "resumable-agent-plan"
        : "resumable-long-run";
      const run = durableStore.start(parsedInput.data, durableScenarioId);
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.flushHeaders();
      const unsubscribe = durableStore.subscribeEvents(run.threadId,
        event => {
          const standardEvent = EventSchemas.parse(event);
          events.push({
            threadId: parsedInput.data.threadId,
            runId: parsedInput.data.runId,
            type: standardEvent.type,
            timestamp: Date.now(),
          });
          if (events.length > 500) events.shift();
          if (!response.destroyed) response.write(`data: ${JSON.stringify(standardEvent)}\n\n`);
        },
        () => { if (!response.destroyed) response.end(); },
      );
      response.once("close", unsubscribe);
      return;
    }

    const controller = new AbortController();
    const abort = (): void => controller.abort();
    request.once("aborted", abort);
    response.once("close", abort);

    let stream: AsyncIterable<AGUIEvent>;
    try {
      stream = await (resolveRun ?? createScenarioMockRunResolver(registry))(parsedInput.data, {
        ...(scenarioId === null ? {} : { scenarioId }),
        speed: parseTimingScale(requestUrl), signal: controller.signal,
      });
    } catch (error) {
      request.removeListener("aborted", abort);
      response.removeListener("close", abort);
      sendJsonError(response, 400, error instanceof Error ? error.message : "Unable to resolve mock source.");
      return;
    }
    if (controller.signal.aborted || response.destroyed) {
      request.removeListener("aborted", abort);
      response.removeListener("close", abort);
      return;
    }

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();

    try {
      for await (const event of stream) {
        if (controller.signal.aborted || response.destroyed) return;
        const standardEvent = EventSchemas.parse(event);
        events.push({ threadId: parsedInput.data.threadId, runId: parsedInput.data.runId, type: standardEvent.type, timestamp: Date.now() });
        if (events.length > 500) events.shift();
        response.write(`data: ${JSON.stringify(standardEvent)}\n\n`);
      }
      if (!response.destroyed) response.end();
    } finally {
      request.removeListener("aborted", abort);
      response.removeListener("close", abort);
    }
  };
}
