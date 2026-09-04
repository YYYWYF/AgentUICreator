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
import { CREATOR_RUNTIME_DIAGNOSTICS_API_PATH } from "./shared.js";
import {
  CreatorRuntimeDiagnosticSession,
  CreatorRuntimeDiagnosticStore,
  createCreatorRuntimeDiagnosticProjectId,
} from "./runtime-diagnostics/CreatorRuntimeDiagnosticStore.js";

export {
  CREATOR_API_PATH,
  CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
} from "./shared.js";
// Keep a bounded recovery window above the early DeepAgents summarization
// threshold. The AG-UI client replaces its history when the summary snapshot
// arrives, so ordinary follow-up requests stay well below this ceiling.
const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_RUNTIME_DIAGNOSTIC_REQUEST_BYTES = 64 * 1024;

export interface CreatorDevServerPluginOptions {
  projectRoot: string;
  configRoot?: string | undefined;
}

export type CreatorAgUiRunner = Pick<CreatorAgUiAdapter, "run">;

async function readRequestBody(
  request: IncomingMessage,
  maximumBytes = MAX_REQUEST_BYTES,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maximumBytes) {
      throw new Error("Creator 请求内容过大，请新建会话后重试。");
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Creator 请求体必须是有效的 JSON。");
  }
}

export async function handleCreatorRuntimeDiagnosticRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: CreatorRuntimeDiagnosticStore,
  projectId: string,
): Promise<void> {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "不支持此请求方法。" });
    return;
  }

  try {
    const input = await readRequestBody(
      request,
      MAX_RUNTIME_DIAGNOSTIC_REQUEST_BYTES,
    );
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new Error("运行时诊断请求体必须是对象。");
    }
    const source = input as Record<string, unknown>;
    if (typeof source.threadId !== "string") {
      throw new Error("运行时诊断请求缺少 threadId。");
    }
    const hasDiagnostic = source.diagnostic !== undefined;
    const hasComposition = source.composition !== undefined;
    if (hasDiagnostic === hasComposition) {
      throw new Error("运行时请求必须且只能包含 diagnostic 或 composition。");
    }
    const result = hasDiagnostic
      ? store.record(projectId, source.threadId, source.diagnostic)
      : store.recordComposition(projectId, source.threadId, source.composition);
    sendJson(response, 202, result);
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
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
  const runtimeDiagnosticStore = new CreatorRuntimeDiagnosticStore();
  const runtimeDiagnosticProjectId =
    createCreatorRuntimeDiagnosticProjectId(projectRoot);
  const runtimeDiagnostics = new CreatorRuntimeDiagnosticSession(
    runtimeDiagnosticStore,
    runtimeDiagnosticProjectId,
  );

  const getAgent = (): CreatorAgUiAdapter => {
    if (agent !== undefined) {
      return agent;
    }

    agent = createProjectCreatorAgUiAdapter({
      projectRoot,
      ...(configRoot === undefined ? {} : { configRoot }),
      runtimeDiagnostics,
    });
    return agent;
  };

  return {
    name: "agent-ui-creator-dev-server",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
        async (request, response) => {
          await handleCreatorRuntimeDiagnosticRequest(
            request,
            response,
            runtimeDiagnosticStore,
            runtimeDiagnosticProjectId,
          );
        },
      );
      server.middlewares.use(
        CREATOR_API_PATH,
        async (request, response) => {
          await handleCreatorRequest(request, response, getAgent());
        },
      );
    },
  };
}
