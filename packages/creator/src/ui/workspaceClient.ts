import { useAgentUILocale, DEFAULT_CREATOR_MESSAGES, type CreatorLocaleMessages } from "./i18n/locale.js";
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

async function workspaceFetch<T>(route: string, body?: unknown, signal?: AbortSignal, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Promise<T> {
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
    throw new CreatorWorkspaceRequestError(error.error ?? localeMessages.errors.workspaceRequestFailed, error);
  }
  return result as T;
}

export const getWorkspaceState = (localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) => workspaceFetch<CreatorWorkspacePublicState>("", undefined, undefined, localeMessages);
export const selectWorkspaceProject = (projectRoot: string, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) =>
  workspaceFetch<CreatorWorkspacePublicState>("/select", { projectRoot }, undefined, localeMessages);
export const chooseWorkspaceProject = (localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) =>
  workspaceFetch<CreatorWorkspacePublicState | { readonly status: "cancelled" }>("/choose-directory", {}, undefined, localeMessages);
export const clearWorkspaceProject = (localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) =>
  workspaceFetch<CreatorWorkspacePublicState>("/clear", {}, undefined, localeMessages);
export const refreshWorkspaceProject = (localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) =>
  workspaceFetch<CreatorWorkspacePublicState>("/refresh", {}, undefined, localeMessages);
export const getWorkspaceSetup = (signal?: AbortSignal, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) =>
  workspaceFetch<CreatorWorkspaceSetupInfo>("/setup", undefined, signal, localeMessages);
export const validateWorkspaceSetup = (input: CreatorWorkspaceInitializeInput, signal?: AbortSignal, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) =>
  workspaceFetch<CreatorProjectSetupValidation>("/setup/validate", input, signal, localeMessages);
export const initializeWorkspaceProjectRequest = (input: CreatorWorkspaceInitializeInput, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) =>
  workspaceFetch<CreatorWorkspacePublicState>("/initialize", input, undefined, localeMessages);

export async function executeCreatorCommand(workspaceId: string, request: import("../commands/types.js").CreatorCommandExecuteRequest, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) {
  const response = await fetch("/__creator/commands/execute", {
    method: "POST", headers: { "Content-Type": "application/json", "x-agent-ui-workspace-id": workspaceId },
    body: JSON.stringify(request),
  });
  const result = await response.json();
  if (!response.ok) throw new CreatorWorkspaceRequestError(localeMessages.commands.failed, result);
  return result as import("../commands/types.js").CreatorCommandResult;
}
