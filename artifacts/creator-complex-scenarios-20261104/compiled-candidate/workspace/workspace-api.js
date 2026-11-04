import { CreatorWorkspaceError, CreatorWorkspaceManager } from "./CreatorWorkspaceManager.js";
import { chooseProjectDirectory } from "./project-directory-picker.js";
import { publicWorkspaceState, CREATOR_PROJECT_MODES, CREATOR_WORKSPACE_API_PATH } from "./types.js";
export { CREATOR_WORKSPACE_API_PATH } from "./types.js";
const MODE_PRESENTATION = {
    assistant: { title: "Assistant", description: "Add a global AI assistant to an existing application." },
    embedded: { title: "Embedded", description: "Place Agent capabilities inside an existing workflow." },
    platform: { title: "Platform", description: "Build a standalone Agent workspace." },
};
const SETUP_MODES = CREATOR_PROJECT_MODES.map((id) => ({ id, ...MODE_PRESENTATION[id] }));
function sendJson(response, status, value) {
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify(value));
}
async function readBody(request) {
    let source = "";
    for await (const chunk of request) {
        source += chunk.toString();
        if (source.length > 4096)
            throw new CreatorWorkspaceError("CREATOR_WORKSPACE_INPUT_TOO_LARGE", "Workspace request is too large.");
    }
    try {
        return JSON.parse(source);
    }
    catch {
        throw new CreatorWorkspaceError("CREATOR_WORKSPACE_INPUT_INVALID", "Workspace request must contain JSON.");
    }
}
async function readSetupInput(request) {
    const body = await readBody(request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new CreatorWorkspaceError("CREATOR_WORKSPACE_INPUT_INVALID", "Setup requires mode and sourceRoot.");
    }
    const fields = body;
    if (Object.keys(fields).some(key => !["mode", "sourceRoot", "planId"].includes(key)) || (fields.planId !== undefined && typeof fields.planId !== "string") ||
        typeof fields.mode !== "string" ||
        !CREATOR_PROJECT_MODES.includes(fields.mode) ||
        typeof fields.sourceRoot !== "string" || fields.sourceRoot.trim() === "") {
        throw new CreatorWorkspaceError("CREATOR_WORKSPACE_INPUT_INVALID", "Setup requires a supported mode and nonempty sourceRoot.");
    }
    return { mode: fields.mode, sourceRoot: fields.sourceRoot, ...(typeof fields.planId === "string" ? { planId: fields.planId } : {}) };
}
function publicDetails(details, projectRoot) {
    if (!Array.isArray(details))
        return undefined;
    if (!details.every((issue) => typeof issue === "object" && issue !== null &&
        typeof issue.code === "string" && typeof issue.message === "string"))
        return undefined;
    return details.map((issue) => ({
        code: issue.code,
        message: projectRoot === undefined ? issue.message : issue.message.replaceAll(projectRoot, "<project>"),
    }));
}
export async function handleCreatorWorkspaceRequest(request, response, manager, pickerStartDirectory = process.cwd(), pickDirectory = chooseProjectDirectory) {
    const route = request.url?.split("?", 1)[0] ?? "/";
    try {
        if (request.method === "GET" && (route === "/" || route === "")) {
            sendJson(response, 200, publicWorkspaceState(manager.getState()));
            return;
        }
        if (request.method === "GET" && route === "/setup") {
            const state = manager.getState();
            sendJson(response, 200, {
                suggestedSourceRoot: await manager.suggestSourceRoot(),
                modes: SETUP_MODES,
                ...(state.status !== "none" && state.workspace.hostFramework === "vue" ? { hostFramework: "vue" } : {}),
            });
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
                typeof body.projectRoot !== "string" ||
                Object.keys(body).length !== 1) {
                throw new CreatorWorkspaceError("CREATOR_WORKSPACE_INPUT_INVALID", "Select requires projectRoot.");
            }
            const projectRoot = body.projectRoot.trim();
            if (projectRoot === "")
                throw new CreatorWorkspaceError("CREATOR_WORKSPACE_INPUT_INVALID", "Project Root is required.");
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
        if (route === "/integration/build") {
            sendJson(response, 200, await manager.buildCompatibility());
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
    }
    catch (error) {
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
//# sourceMappingURL=workspace-api.js.map