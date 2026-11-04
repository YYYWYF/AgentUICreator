import { useAgentUILocale, DEFAULT_CREATOR_MESSAGES } from "./i18n/locale.js";
import { CREATOR_WORKSPACE_API_PATH, } from "../workspace/types.js";
export class CreatorWorkspaceRequestError extends Error {
    code;
    details;
    constructor(message, body) {
        super(message);
        this.name = "CreatorWorkspaceRequestError";
        this.code = body.code;
        this.details = body.details;
    }
}
async function readWorkspaceJson(response, localeMessages) {
    try {
        if (!response.headers.get("content-type")?.toLowerCase().includes("application/json"))
            throw new Error();
        return await response.json();
    }
    catch (error) {
        if (error instanceof Error && error.name === "AbortError")
            throw error;
        throw new CreatorWorkspaceRequestError(localeMessages.errors.workspaceResponseInvalid, {
            code: "CREATOR_WORKSPACE_RESPONSE_INVALID",
        });
    }
}
async function workspaceFetch(route, body, signal, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    const response = await fetch(`${CREATOR_WORKSPACE_API_PATH}${route}`, {
        ...(body === undefined ? {} : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        ...(signal === undefined ? {} : { signal }),
    });
    const result = await readWorkspaceJson(response, localeMessages);
    if (!response.ok) {
        const error = typeof result === "object" && result !== null
            ? result
            : {};
        throw new CreatorWorkspaceRequestError(error.error ?? localeMessages.errors.workspaceRequestFailed, error);
    }
    return result;
}
export const getWorkspaceState = (localeMessages = DEFAULT_CREATOR_MESSAGES) => workspaceFetch("", undefined, undefined, localeMessages);
export const selectWorkspaceProject = (projectRoot, localeMessages = DEFAULT_CREATOR_MESSAGES) => workspaceFetch("/select", { projectRoot }, undefined, localeMessages);
export const chooseWorkspaceProject = (localeMessages = DEFAULT_CREATOR_MESSAGES) => workspaceFetch("/choose-directory", {}, undefined, localeMessages);
export const clearWorkspaceProject = (localeMessages = DEFAULT_CREATOR_MESSAGES) => workspaceFetch("/clear", {}, undefined, localeMessages);
export const refreshWorkspaceProject = (localeMessages = DEFAULT_CREATOR_MESSAGES) => workspaceFetch("/refresh", {}, undefined, localeMessages);
export const getWorkspaceSetup = (signal, localeMessages = DEFAULT_CREATOR_MESSAGES) => workspaceFetch("/setup", undefined, signal, localeMessages);
export const validateWorkspaceSetup = (input, signal, localeMessages = DEFAULT_CREATOR_MESSAGES) => workspaceFetch("/setup/validate", input, signal, localeMessages);
export const initializeWorkspaceProjectRequest = (input, localeMessages = DEFAULT_CREATOR_MESSAGES) => workspaceFetch("/initialize", input, undefined, localeMessages);
export async function executeCreatorCommand(workspaceId, request, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    const response = await fetch("/__creator/commands/execute", {
        method: "POST", headers: { "Content-Type": "application/json", "x-agent-ui-workspace-id": workspaceId },
        body: JSON.stringify(request),
    });
    const result = await readWorkspaceJson(response, localeMessages);
    if (!response.ok)
        throw new CreatorWorkspaceRequestError(localeMessages.commands.failed, typeof result === "object" && result !== null ? result : {});
    return result;
}
export const buildCompatibilityProjectRequest = (messages = DEFAULT_CREATOR_MESSAGES) => workspaceFetch("/integration/build", {}, undefined, messages);
//# sourceMappingURL=workspaceClient.js.map