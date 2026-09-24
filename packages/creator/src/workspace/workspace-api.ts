import type { IncomingMessage, ServerResponse } from "node:http";

import { CreatorWorkspaceError, CreatorWorkspaceManager } from "./CreatorWorkspaceManager.js";
import { publicWorkspaceState, CREATOR_WORKSPACE_API_PATH } from "./types.js";
export { CREATOR_WORKSPACE_API_PATH } from "./types.js";

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  let source = "";
  for await (const chunk of request) {
    source += chunk.toString();
    if (source.length > 4096) throw new CreatorWorkspaceError("CREATOR_WORKSPACE_INPUT_TOO_LARGE", "Workspace request is too large.");
  }
  try { return JSON.parse(source) as unknown; }
  catch { throw new CreatorWorkspaceError("CREATOR_WORKSPACE_INPUT_INVALID", "Workspace request must contain JSON."); }
}

export async function handleCreatorWorkspaceRequest(
  request: IncomingMessage,
  response: ServerResponse,
  manager: CreatorWorkspaceManager,
): Promise<void> {
  const route = request.url?.split("?", 1)[0] ?? "/";
  try {
    if (request.method === "GET" && (route === "/" || route === "")) {
      sendJson(response, 200, publicWorkspaceState(manager.getState()));
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, { code: "CREATOR_WORKSPACE_METHOD_NOT_ALLOWED" });
      return;
    }
    const origin = request.headers.origin;
    if (origin !== undefined && new URL(origin).host !== request.headers.host) {
      throw new CreatorWorkspaceError("CREATOR_WORKSPACE_ORIGIN_DENIED", "Workspace changes require a same-origin request.");
    }
    if (route === "/select") {
      const body = await readBody(request);
      if (typeof body !== "object" || body === null || Array.isArray(body) ||
          typeof (body as Record<string, unknown>).projectRoot !== "string" ||
          Object.keys(body).length !== 1) {
        throw new CreatorWorkspaceError("CREATOR_WORKSPACE_INPUT_INVALID", "Select requires projectRoot.");
      }
      const projectRoot = (body as { projectRoot: string }).projectRoot.trim();
      if (projectRoot === "") throw new CreatorWorkspaceError("CREATOR_WORKSPACE_INPUT_INVALID", "Project Root is required.");
      sendJson(response, 200, publicWorkspaceState(await manager.selectProject(projectRoot)));
      return;
    }
    if (route === "/clear") {
      await manager.clear();
      sendJson(response, 200, publicWorkspaceState(manager.getState()));
      return;
    }
    if (route === "/refresh") {
      sendJson(response, 200, publicWorkspaceState(await manager.refresh()));
      return;
    }
    sendJson(response, 404, { code: "CREATOR_WORKSPACE_ROUTE_NOT_FOUND" });
  } catch (error) {
    const workspaceError = error instanceof CreatorWorkspaceError ? error : undefined;
    sendJson(response, workspaceError === undefined ? 500 : 400, {
      code: workspaceError?.code ?? "CREATOR_WORKSPACE_REQUEST_FAILED",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
