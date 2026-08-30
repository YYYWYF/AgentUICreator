import type { IncomingMessage, ServerResponse } from "node:http";

import {
  EventSchemas,
  EventType,
  RunAgentInputSchema,
  type AGUIEvent,
} from "@ag-ui/core";
import { EventEncoder } from "@ag-ui/encoder";
import type { Plugin } from "vite";

import {
  createProjectCreatorAgUiAdapter,
  type CreatorAgUiAdapter,
} from "./CreatorAgUiAdapter.js";
import { CREATOR_API_PATH } from "./shared.js";

export { CREATOR_API_PATH } from "./shared.js";
const MAX_REQUEST_BYTES = 64 * 1024;

export interface CreatorDevServerPluginOptions {
  projectRoot: string;
  configRoot?: string | undefined;
}

export type CreatorAgUiRunner = Pick<CreatorAgUiAdapter, "run">;

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      throw new Error("Creator 请求内容过大。");
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Creator 请求体必须是有效的 JSON。");
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  value: object,
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

export function formatCreatorAgUiEvent(event: unknown): string {
  const validatedEvent = EventSchemas.parse(event);
  return new EventEncoder().encode(validatedEvent);
}

function requestAcceptHeader(request: IncomingMessage): string | undefined {
  const accept = request.headers.accept;
  return Array.isArray(accept) ? accept.join(", ") : accept;
}

function writeAgUiEvent(
  response: ServerResponse,
  encoder: EventEncoder,
  event: AGUIEvent,
): void {
  if (response.destroyed || response.writableEnded) {
    return;
  }
  const validatedEvent = EventSchemas.parse(event);
  response.write(encoder.encodeBinary(validatedEvent));
}

export async function handleCreatorRequest(
  request: IncomingMessage,
  response: ServerResponse,
  agent: CreatorAgUiRunner,
): Promise<void> {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "不支持此请求方法。" });
    return;
  }

  let input: ReturnType<typeof RunAgentInputSchema.parse>;
  try {
    input = RunAgentInputSchema.parse(await readRequestBody(request));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 400, { error: message });
    return;
  }

  const accept = requestAcceptHeader(request);
  const encoder = new EventEncoder(accept === undefined ? {} : { accept });
  response.statusCode = 200;
  response.setHeader("Content-Type", encoder.getContentType());
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();

  const abortController = new AbortController();
  response.on("close", () => abortController.abort());

  try {
    for await (const event of agent.run(input, {
      signal: abortController.signal,
    })) {
      writeAgUiEvent(response, encoder, event);
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      const message = error instanceof Error ? error.message : String(error);
      writeAgUiEvent(response, encoder, {
        type: EventType.RUN_ERROR,
        message,
        code: "CREATOR_TRANSPORT_FAILED",
      });
    }
  } finally {
    if (!response.destroyed && !response.writableEnded) {
      response.end();
    }
  }
}

export function createCreatorDevServerPlugin({
  projectRoot,
  configRoot,
}: CreatorDevServerPluginOptions): Plugin {
  let agent: CreatorAgUiAdapter | undefined;

  const getAgent = (): CreatorAgUiAdapter => {
    if (agent !== undefined) {
      return agent;
    }

    agent = createProjectCreatorAgUiAdapter({
      projectRoot,
      ...(configRoot === undefined ? {} : { configRoot }),
    });
    return agent;
  };

  return {
    name: "agent-ui-creator-dev-server",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        CREATOR_API_PATH,
        async (request, response) => {
          await handleCreatorRequest(request, response, getAgent());
        },
      );
    },
  };
}
