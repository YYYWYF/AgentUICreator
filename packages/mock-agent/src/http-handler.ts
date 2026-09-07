import type { IncomingMessage, ServerResponse } from "node:http";

import { EventSchemas, RunAgentInputSchema } from "@ag-ui/core";

import type { MockScenarioRegistry } from "./scenario-registry.js";
import { runMockScenario } from "./scenario-runner.js";

const MAX_REQUEST_BYTES = 1024 * 1024;

export interface MockAgentHttpHandlerOptions {
  registry: MockScenarioRegistry;
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

/** Creates a Node HTTP handler compatible with @ag-ui/client HttpAgent. */
export function createMockAgentHttpHandler({
  registry,
}: MockAgentHttpHandlerOptions): MockAgentHttpHandler {
  return async (request, response) => {
    const requestUrl = parseRequestUrl(request);

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
    if (scenario === undefined) {
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

    const controller = new AbortController();
    const abort = (): void => controller.abort();
    request.once("aborted", abort);
    response.once("close", abort);

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();

    try {
      for await (const event of runMockScenario(parsedInput.data, scenario, {
        signal: controller.signal,
      })) {
        if (controller.signal.aborted || response.destroyed) return;
        const standardEvent = EventSchemas.parse(event);
        response.write(`data: ${JSON.stringify(standardEvent)}\n\n`);
      }
      if (!response.destroyed) response.end();
    } finally {
      request.removeListener("aborted", abort);
      response.removeListener("close", abort);
    }
  };
}
