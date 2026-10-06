import http, { type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";
import { pipeline } from "node:stream";
const hopHeaders = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host"]);
function headers(source: IncomingMessage["headers"]) {
  const blocked = new Set([...hopHeaders, ...String(source.connection ?? "").toLowerCase().split(",").map(value => value.trim()), "x-agent-ui-workspace-id"]);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !blocked.has(key.toLowerCase())));
}
/** Byte-stream transport. No AG-UI parsing, buffering, or redirect following. */
export async function forwardAgentRequest(request: IncomingMessage, response: ServerResponse, target: URL): Promise<void> {
  if (request.destroyed || response.destroyed) return;
  await new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => { if (finished) return; finished = true; resolve(); };
    const upstream = (target.protocol === "https:" ? https : http).request(target, {
      method: request.method, headers: headers(request.headers),
    }, incoming => {
      // The workspace selected exactly this endpoint; redirects cannot retarget it.
      if (incoming.statusCode && [301, 302, 303, 307, 308].includes(incoming.statusCode)) {
        incoming.destroy(); response.writeHead(502); response.end("Agent redirects are not supported."); finish(); return;
      }
      const outgoingHeaders = headers(incoming.headers);
      if (String(incoming.headers["content-type"]).includes("text/event-stream")) {
        const cache = String(incoming.headers["cache-control"] ?? "no-cache");
        outgoingHeaders["cache-control"] = cache.includes("no-transform") ? cache : `${cache}, no-transform`;
        outgoingHeaders["x-accel-buffering"] = "no";
      }
      response.writeHead(incoming.statusCode ?? 502, outgoingHeaders);
      response.flushHeaders();
      pipeline(incoming, response, () => { upstream.destroy(); finish(); });
    });
    const abort = () => { upstream.destroy(); finish(); };
    request.once("aborted", abort);
    request.once("error", abort);
    response.once("close", abort);
    upstream.once("error", () => {
      if (!response.headersSent) { response.writeHead(502); response.end("Agent upstream request failed."); }
      else response.destroy();
      finish();
    });
    upstream.once("close", () => { request.off("aborted", abort); response.off("close", abort); });
    request.pipe(upstream);
  });
}
