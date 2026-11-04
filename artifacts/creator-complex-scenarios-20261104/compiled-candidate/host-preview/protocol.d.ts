import type { ResolvedPreviewAgentSource } from "../agent-connection/types.js";
export declare const HOST_PREVIEW_CONNECT = "agent-ui-creator:host-preview-connect";
export declare const HOST_DOCK_CONNECT = "agent-ui-creator:host-dock-connect";
export declare const CREATOR_BUSINESS_PAGE_REQUEST = "agent-ui-creator:business-page-request";
export declare const CREATOR_BUSINESS_PAGE_RESULT = "agent-ui-creator:business-page-result";
export declare const AGENT_UI_OBSERVATION_REQUEST_EVENT = "agent-ui:observation-request";
export declare const AGENT_UI_OBSERVATION_EVENT = "agent-ui:observation";
export declare const CREATOR_OBSERVATION_REQUEST_EVENT = "agent-ui-creator:runtime-observation-request";
export interface RuntimeObservationRequest {
    requestId: string;
    currentHash: string;
    threadId: string;
    instanceIds?: string[];
    nodeIds?: string[];
}
export declare function isRuntimeObservationRequest(value: unknown): value is RuntimeObservationRequest;
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
export declare function isHostPreviewSession(value: unknown): value is HostPreviewSession;
//# sourceMappingURL=protocol.d.ts.map