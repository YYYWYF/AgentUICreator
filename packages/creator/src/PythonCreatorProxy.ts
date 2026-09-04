import {
  request as createHttpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  PythonCreatorProcessManager,
  PythonCreatorRuntimeError,
} from "./PythonCreatorProcessManager.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function proxyHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name, value]) => value !== undefined && !HOP_BY_HOP_HEADERS.has(name),
    ),
  );
}

function sendProxyError(response: ServerResponse, error: unknown): void {
  if (response.destroyed) {
    return;
  }
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : undefined);
    return;
  }
  const runtimeError =
    error instanceof PythonCreatorRuntimeError ? error : undefined;
  response.statusCode = 503;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      code: runtimeError?.code ?? "CREATOR_PYTHON_PROXY_FAILED",
    }),
  );
}

export async function proxyPythonCreatorRequest(
  request: IncomingMessage,
  response: ServerResponse,
  manager: PythonCreatorProcessManager,
  path: "/creator" | "/runtime-diagnostics",
): Promise<void> {
  try {
    const endpoint = await manager.ensureStarted();
    await new Promise<void>((resolve, reject) => {
      const upstream = createHttpRequest(
        {
          hostname: endpoint.host,
          port: endpoint.port,
          path,
          method: request.method,
          headers: {
            ...proxyHeaders(request.headers),
            host: `${endpoint.host}:${endpoint.port}`,
            authorization: `Bearer ${endpoint.authToken}`,
          },
        },
        (upstreamResponse) => {
          response.statusCode = upstreamResponse.statusCode ?? 502;
          for (const [name, value] of Object.entries(upstreamResponse.headers)) {
            if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name)) {
              response.setHeader(name, value);
            }
          }
          upstreamResponse.on("error", reject);
          upstreamResponse.on("end", resolve);
          upstreamResponse.pipe(response);
        },
      );
      upstream.on("error", reject);
      request.on("error", (error) => {
        upstream.destroy(error);
        reject(error);
      });
      request.on("aborted", () => upstream.destroy());
      response.on("close", () => {
        if (!response.writableEnded) {
          upstream.destroy();
        }
      });
      request.pipe(upstream);
    });
  } catch (error) {
    sendProxyError(response, error);
  }
}
