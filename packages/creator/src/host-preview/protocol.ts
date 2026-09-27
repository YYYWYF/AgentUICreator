export const HOST_PREVIEW_CONNECT = "agent-ui-creator:host-preview-connect";
export const AGENT_UI_OBSERVATION_REQUEST_EVENT = "agent-ui:observation-request";
export const AGENT_UI_OBSERVATION_EVENT = "agent-ui:observation";

export interface HostPreviewSession {
  workspaceId: string;
  threadId: string;
  creatorOrigin: string;
  runtimeDiagnostics: boolean;
  visualObservation: boolean;
}

export interface PreviewUpload {
  id: number;
  endpoint: string;
  body: string;
}
export interface PreviewUploadResult {
  id: number;
  status?: number;
  error?: string;
}

export function isHostPreviewSession(value: unknown): value is HostPreviewSession {
  if (value === null || typeof value !== "object") return false;
  const session = value as Partial<HostPreviewSession>;
  return typeof session.workspaceId === "string" && session.workspaceId.length > 0 &&
    typeof session.threadId === "string" && session.threadId.length > 0 &&
    typeof session.creatorOrigin === "string" &&
    typeof session.runtimeDiagnostics === "boolean" && typeof session.visualObservation === "boolean";
}
