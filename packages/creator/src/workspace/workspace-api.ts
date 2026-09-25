import type { IncomingMessage, ServerResponse } from "node:http";

import { CreatorWorkspaceError, CreatorWorkspaceManager } from "./CreatorWorkspaceManager.js";
import { chooseProjectDirectory } from "./project-directory-picker.js";
import { publicWorkspaceState, CREATOR_PROJECT_MODES, CREATOR_WORKSPACE_API_PATH,
  type CreatorWorkspaceInitializeInput, type CreatorWorkspaceSetupInfo } from "./types.js";
export { CREATOR_WORKSPACE_API_PATH } from "./types.js";

const MODE_PRESENTATION: Record<CreatorWorkspaceInitializeInput["mode"], { title: string; description: string }> = {
  assistant: { title: "Assistant", description: "Add a global AI assistant to an existing application." },
  embedded: { title: "Embedded", description: "Place Agent capabilities inside an existing workflow." },
  platform: { title: "Platform", description: "Build a standalone Agent workspace." },
};
const SETUP_MODES: CreatorWorkspaceSetupInfo["modes"] = CREATOR_PROJECT_MODES.map((id) => ({ id, ...MODE_PRESENTATION[id] }));

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

async function readSetupInput(request: IncomingMessage): Promise<CreatorWorkspaceInitializeInput> {
  const body = await readBody(request);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new CreatorWorkspaceError("CREATOR_WORKSPACE_INPUT_INVALID", "Setup requires mode and sourceRoot.");
  }
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).sort().join(",") !== "mode,sourceRoot" ||
      typeof fields.mode !== "string" ||
      !(CREATOR_PROJECT_MODES as readonly string[]).includes(fields.mode) ||
      typeof fields.sourceRoot !== "string" || fields.sourceRoot.trim() === "") {
    throw new CreatorWorkspaceError("CREATOR_WORKSPACE_INPUT_INVALID", "Setup requires a supported mode and nonempty sourceRoot.");
  }
  return { mode: fields.mode as CreatorWorkspaceInitializeInput["mode"], sourceRoot: fields.sourceRoot };
}

function publicDetails(details: unknown, projectRoot: string | undefined): readonly { code: string; message: string }[] | undefined {
  if (!Array.isArray(details)) return undefined;
  if (!details.every((issue) => typeof issue === "object" && issue !== null &&
      typeof issue.code === "string" && typeof issue.message === "string")) return undefined;
  return details.map((issue: { code: string; message: string }) => ({
    code: issue.code,
    message: projectRoot === undefined ? issue.message : issue.message.replaceAll(projectRoot, "<project>"),
  }));
}

export async function handleCreatorWorkspaceRequest(
  request: IncomingMessage,
  response: ServerResponse,
  manager: CreatorWorkspaceManager,
  pickerStartDirectory: string = process.cwd(),
  pickDirectory: (startDirectory: string) => Promise<string | undefined> = chooseProjectDirectory,
): Promise<void> {
  const route = request.url?.split("?", 1)[0] ?? "/";
  try {
    if (request.method === "GET" && (route === "/" || route === "")) {
      sendJson(response, 200, publicWorkspaceState(manager.getState()));
      return;
    }
    if (request.method === "GET" && route === "/setup") {
      sendJson(response, 200, {
        suggestedSourceRoot: await manager.suggestSourceRoot(),
        modes: SETUP_MODES,
      } satisfies CreatorWorkspaceSetupInfo);
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
    if (route === "/choose-directory") {
      const state = manager.getState();
      const startDirectory = state.status === "none" ? pickerStartDirectory : state.workspace.projectRoot;
      const selectedPath = await pickDirectory(startDirectory);
      sendJson(response, 200, selectedPath === undefined
        ? { status: "cancelled" }
        : publicWorkspaceState(await manager.selectProject(selectedPath)));
      return;
    }
    if (route === "/setup/validate") {
      sendJson(response, 200, await manager.validateSetup(await readSetupInput(request)));
      return;
    }
    if (route === "/initialize") {
      sendJson(response, 200, publicWorkspaceState(await manager.initializeProject(await readSetupInput(request))));
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
    const errorCode = workspaceError?.code ?? (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined);
    const state = manager.getState();
    const projectRoot = state.status === "none" ? undefined : state.workspace.projectRoot;
    const details = typeof error === "object" && error !== null && "details" in error ? publicDetails(error.details, projectRoot) : undefined;
    sendJson(response, errorCode === undefined ? 500 : 400, {
      code: errorCode ?? "CREATOR_WORKSPACE_REQUEST_FAILED",
      error: error instanceof Error ? error.message : String(error),
      ...(details === undefined ? {} : { details }),
    });
  }
}
