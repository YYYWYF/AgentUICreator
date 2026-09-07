import type { IncomingMessage, ServerResponse } from "node:http";

import { EventSchemas, RunAgentInputSchema } from "@ag-ui/core";

import type { MockScenario } from "./scenario.js";
import { runMockScenario } from "./scenario-runner.js";

const MAX_REQUEST_BYTES = 1024 * 1024;

export interface MockAgentHttpHandlerOptions {
  scenario: MockScenario;
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

/** Creates a Node HTTP handler compatible with @ag-ui/client HttpAgent. */
export function createMockAgentHttpHandler({
  scenario,
}: MockAgentHttpHandlerOptions): MockAgentHttpHandler {
  return async (request, response) => {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      sendJsonError(response, 405, "Mock Agent endpoint only accepts POST.");
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
