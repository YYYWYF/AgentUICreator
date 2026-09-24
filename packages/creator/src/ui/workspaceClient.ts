import {
  CREATOR_WORKSPACE_API_PATH,
  type CreatorProjectIssue,
  type CreatorProjectSetupValidation,
  type CreatorWorkspaceInitializeInput,
  type CreatorWorkspacePublicState,
  type CreatorWorkspaceSetupInfo,
} from "../workspace/types.js";

interface CreatorWorkspaceApiErrorBody {
  code?: string;
  error?: string;
  details?: CreatorProjectIssue[];
}

export class CreatorWorkspaceRequestError extends Error {
  readonly code: string | undefined;
  readonly details: readonly CreatorProjectIssue[] | undefined;

  constructor(message: string, body: CreatorWorkspaceApiErrorBody) {
    super(message);
    this.name = "CreatorWorkspaceRequestError";
    this.code = body.code;
    this.details = body.details;
  }
}

async function workspaceFetch<T>(route: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${CREATOR_WORKSPACE_API_PATH}${route}`, {
    ...(body === undefined ? {} : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    ...(signal === undefined ? {} : { signal }),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const error = typeof result === "object" && result !== null
      ? result as CreatorWorkspaceApiErrorBody
      : {};
    throw new CreatorWorkspaceRequestError(error.error ?? "工作区请求失败", error);
  }
  return result as T;
}

export const getWorkspaceState = () => workspaceFetch<CreatorWorkspacePublicState>("");
export const selectWorkspaceProject = (projectRoot: string) =>
  workspaceFetch<CreatorWorkspacePublicState>("/select", { projectRoot });
export const clearWorkspaceProject = () =>
  workspaceFetch<CreatorWorkspacePublicState>("/clear", {});
export const refreshWorkspaceProject = () =>
  workspaceFetch<CreatorWorkspacePublicState>("/refresh", {});
export const getWorkspaceSetup = (signal?: AbortSignal) =>
  workspaceFetch<CreatorWorkspaceSetupInfo>("/setup", undefined, signal);
export const validateWorkspaceSetup = (input: CreatorWorkspaceInitializeInput, signal?: AbortSignal) =>
  workspaceFetch<CreatorProjectSetupValidation>("/setup/validate", input, signal);
export const initializeWorkspaceProjectRequest = (input: CreatorWorkspaceInitializeInput) =>
  workspaceFetch<CreatorWorkspacePublicState>("/initialize", input);
