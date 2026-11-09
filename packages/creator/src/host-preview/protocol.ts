import type { ResolvedPreviewAgentSource } from "../agent-connection/types.js";
export const HOST_PREVIEW_CONNECT = "agent-ui-creator:host-preview-connect";
export const HOST_DOCK_CONNECT = "agent-ui-creator:host-dock-connect";
export const CREATOR_BUSINESS_PAGE_REQUEST = "agent-ui-creator:business-page-request";
export const CREATOR_BUSINESS_PAGE_RESULT = "agent-ui-creator:business-page-result";
export const AGENT_UI_OBSERVATION_REQUEST_EVENT = "agent-ui:observation-request";
export const AGENT_UI_OBSERVATION_EVENT = "agent-ui:observation";
export const CREATOR_OBSERVATION_REQUEST_EVENT = "agent-ui-creator:runtime-observation-request";
export interface RuntimeObservationRequest { requestId: string; currentHash: string; currentHashes?: string[]; threadId: string; instanceIds?: string[]; nodeIds?: string[] }
export function isRuntimeObservationRequest(value: unknown): value is RuntimeObservationRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as RuntimeObservationRequest;
  return typeof request.requestId === "string" && /^[a-f0-9-]{36}$/u.test(request.requestId) &&
    typeof request.currentHash === "string" && /^[a-f0-9]{64}$/u.test(request.currentHash) &&
    (request.currentHashes === undefined || (Array.isArray(request.currentHashes) && request.currentHashes.length > 0 && request.currentHashes.length <= 2 && request.currentHashes.includes(request.currentHash) && request.currentHashes.every(hash => typeof hash === "string" && /^[a-f0-9]{64}$/u.test(hash)))) &&
    typeof request.threadId === "string" && request.threadId.length > 0 && request.threadId.length <= 200 &&
    [request.instanceIds, request.nodeIds].every(ids => ids === undefined || (Array.isArray(ids) && ids.length <= 50 && ids.every(id => typeof id === "string" && id.length > 0 && id.length <= 200)));
}

export interface HostPreviewSession {
  workspaceId: string;
  threadId: string;
  creatorOrigin: string;
  runtimeDiagnostics: boolean;
  visualObservation: boolean;
  previewSource?: ResolvedPreviewAgentSource;
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
