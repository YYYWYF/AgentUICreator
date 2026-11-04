import { CREATOR_RUNTIME_DIAGNOSTICS_API_PATH } from "../shared.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
export const MAX_CREATOR_RUNTIME_DIAGNOSTIC_REPORT_BYTES = 48 * 1_024;
function resolveThreadId(threadId) {
    return typeof threadId === "function" ? threadId() : threadId;
}
export function createCreatorRuntimeDiagnosticReporter({ threadId, workspaceId, endpoint = CREATOR_RUNTIME_DIAGNOSTICS_API_PATH, fetch: upload = globalThis.fetch, }) {
    return (diagnostic) => {
        let body;
        try {
            body = JSON.stringify({ threadId: resolveThreadId(threadId), diagnostic });
        }
        catch {
            return;
        }
        if (new TextEncoder().encode(body).byteLength >
            MAX_CREATOR_RUNTIME_DIAGNOSTIC_REPORT_BYTES) {
            return;
        }
        void upload(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(workspaceId === undefined ? {} : { [CREATOR_WORKSPACE_ID_HEADER]: workspaceId }) },
            body,
            keepalive: true,
        }).catch(() => undefined);
    };
}
export function createCreatorRuntimeCompositionReporter({ threadId, workspaceId, endpoint = CREATOR_RUNTIME_DIAGNOSTICS_API_PATH, fetch: upload = globalThis.fetch, }) {
    return (composition, observationRequestId, presentation) => {
        let body;
        try {
            body = JSON.stringify({
                threadId: resolveThreadId(threadId),
                composition,
                ...(observationRequestId ? { observationRequestId } : {}),
                ...(presentation ? { presentation } : {}),
            });
            if (presentation && new TextEncoder().encode(body).byteLength > MAX_CREATOR_RUNTIME_DIAGNOSTIC_REPORT_BYTES) {
                body = JSON.stringify({ threadId: resolveThreadId(threadId), composition, ...(observationRequestId ? { observationRequestId } : {}),
                    presentation: { status: "unavailable", reason: "report_size_limit", regions: [], truncated: true } });
            }
        }
        catch {
            return;
        }
        if (new TextEncoder().encode(body).byteLength >
            MAX_CREATOR_RUNTIME_DIAGNOSTIC_REPORT_BYTES) {
            return;
        }
        void upload(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(workspaceId === undefined ? {} : { [CREATOR_WORKSPACE_ID_HEADER]: workspaceId }) },
            body,
            keepalive: true,
        }).catch(() => undefined);
    };
}
//# sourceMappingURL=runtimeDiagnosticReporter.js.map