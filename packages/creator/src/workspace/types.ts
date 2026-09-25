import type { PythonCreatorProcessManager } from "../PythonCreatorProcessManager.js";

export const CREATOR_WORKSPACE_API_PATH = "/__agent-ui/creator/workspace";
export const CREATOR_WORKSPACE_ID_HEADER = "x-agent-ui-workspace-id";

export interface CreatorWorkspaceDescriptor {
  readonly id: string;
  readonly projectRoot: string;
  readonly name: string;
  readonly displayPath: string;
}

export interface CreatorProjectIssue {
  readonly code: string;
  readonly message: string;
  readonly severity?: "error" | "warning";
}

export const CREATOR_PROJECT_MODES = ["assistant", "embedded", "platform"] as const;
export type CreatorProjectMode = (typeof CREATOR_PROJECT_MODES)[number];

export interface CreatorWorkspaceInitializeInput {
  readonly mode: CreatorProjectMode;
  readonly sourceRoot: string;
}

export interface CreatorProjectSetupValidation {
  readonly valid: boolean;
  readonly sourceRoot: {
    readonly normalized: string;
    readonly parentExists: boolean;
    readonly targetState: "missing" | "empty" | "managed" | "occupied";
  };
  readonly issues: readonly CreatorProjectIssue[];
}

export interface CreatorWorkspaceSetupInfo {
  readonly suggestedSourceRoot: string;
  readonly modes: readonly { readonly id: CreatorProjectMode; readonly title: string; readonly description: string }[];
}

export interface CreatorWorkspaceDirectoryListing {
  readonly path: string;
  readonly parentPath: string | null;
  readonly homePath: string;
  readonly startPath: string;
  readonly breadcrumbs: readonly { readonly label: string; readonly path: string }[];
  readonly directories: readonly { readonly name: string; readonly path: string }[];
}

export interface CreatorProjectConfig {
  readonly version: "1" | "2";
  readonly mode: CreatorProjectMode;
  readonly sourceRoot?: string;
}

export type CreatorProjectInspection =
  | { readonly status: "uninitialized" }
  | { readonly status: "ready" | "legacy"; readonly projectConfig: CreatorProjectConfig; readonly paths: { readonly sourceRoot: string }; readonly warnings?: readonly CreatorProjectIssue[] }
  | { readonly status: "broken"; readonly issues: CreatorProjectIssue[] };

export type CreatorRuntimeState =
  | { readonly status: "stopped" | "starting" | "ready" }
  | { readonly status: "unavailable"; readonly code: string; readonly message: string };

export type CreatorWorkspaceState =
  | { readonly status: "none" }
  | { readonly status: "uninitialized"; readonly workspace: CreatorWorkspaceDescriptor }
  | { readonly status: "ready" | "legacy"; readonly workspace: CreatorWorkspaceDescriptor; readonly project: CreatorProjectConfig; readonly runtime: CreatorRuntimeState; readonly warnings?: readonly CreatorProjectIssue[] }
  | { readonly status: "broken"; readonly workspace: CreatorWorkspaceDescriptor; readonly issues: CreatorProjectIssue[] };

export type CreatorWorkspacePublicState =
  | { readonly status: "none" }
  | { readonly status: "uninitialized"; readonly workspace: Omit<CreatorWorkspaceDescriptor, "projectRoot"> }
  | { readonly status: "ready" | "legacy"; readonly workspace: Omit<CreatorWorkspaceDescriptor, "projectRoot">; readonly project: CreatorProjectConfig; readonly runtime: CreatorRuntimeState; readonly warnings?: readonly CreatorProjectIssue[] }
  | { readonly status: "broken"; readonly workspace: Omit<CreatorWorkspaceDescriptor, "projectRoot">; readonly issues: CreatorProjectIssue[] };

export function publicWorkspaceState(state: CreatorWorkspaceState): CreatorWorkspacePublicState {
  if (state.status === "none") return state;
  const { projectRoot: _projectRoot, ...workspace } = state.workspace;
  if (state.status === "ready" || state.status === "legacy") {
    return { status: state.status, workspace, project: state.project, runtime: state.runtime, ...(state.warnings === undefined ? {} : { warnings: state.warnings }) };
  }
  if (state.status === "broken") return { status: "broken", workspace, issues: state.issues };
  return { status: "uninitialized", workspace };
}

export type CreatorPythonManagerFactory = (projectRoot: string) => PythonCreatorProcessManager;
