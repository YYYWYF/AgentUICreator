import { CONNECTION_API } from "../agent-connection/types.js";
import { resolvePreviewAgentSource } from "../agent-connection/source-resolver.js";
import { CREATOR_RUNTIME_DIAGNOSTICS_API_PATH, CREATOR_VISUAL_OBSERVATION_API_PATH } from "../shared.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import { CREATOR_BUSINESS_PAGE_REQUEST, CREATOR_BUSINESS_PAGE_RESULT, CREATOR_OBSERVATION_REQUEST_EVENT, isRuntimeObservationRequest, HOST_DOCK_CONNECT, HOST_PREVIEW_CONNECT } from "./protocol.js";
/** Each iframe load / selected thread gets its own port and immutable workspace identity. */
export function connectCreatorHostPreview(frame, session) {
    const target = frame.contentWindow;
    if (target === null)
        return () => undefined;
    return connectHost(target, new URL(frame.src, location.href).origin, HOST_PREVIEW_CONNECT, session);
}
/** The dock is inside the Host, so its connection travels to the parent. */
export function connectCreatorDockHost(session) {
    if (window.parent === window || !document.referrer)
        return () => undefined;
    return connectHost(window.parent, new URL(document.referrer).origin, HOST_DOCK_CONNECT, session);
}
function connectHost(target, targetOrigin, type, session) {
    const channel = new MessageChannel();
    const uploads = new Set();
    let active = true;
    const pageRequests = new Set();
    channel.port1.onmessage = (event) => {
        const message = event.data;
        if (message.type === "business-page-url") {
            if (!active || typeof message.requestId !== "string" || !pageRequests.delete(message.requestId) || typeof message.pageUrl !== "string")
                return;
            try {
                const page = new URL(message.pageUrl);
                if (!["http:", "https:"].includes(page.protocol) || page.origin !== targetOrigin || page.username || page.password)
                    return;
                window.dispatchEvent(new CustomEvent(CREATOR_BUSINESS_PAGE_RESULT, { detail: { workspaceId: session.workspaceId, requestId: message.requestId, pageUrl: page.href } }));
            }
            catch { /* Invalid Host URLs cannot become a connection base. */ }
            return;
        }
        if (event.data.type === "preview-running") {
            window.dispatchEvent(new CustomEvent("agent-ui-creator:preview-running", { detail: event.data }));
            return;
        }
        const upload = event.data;
        if (!active || !upload || !Number.isSafeInteger(upload.id) || typeof upload.body !== "string" || upload.body.length > 1_048_576)
            return;
        const runtime = upload.endpoint === CREATOR_RUNTIME_DIAGNOSTICS_API_PATH && session.runtimeDiagnostics;
        const visual = upload.endpoint === CREATOR_VISUAL_OBSERVATION_API_PATH && session.visualObservation;
        if (!runtime && !visual)
            return;
        if (runtime) {
            try {
                if (JSON.parse(upload.body).threadId !== session.threadId)
                    return;
            }
            catch {
                return;
            }
        }
        const controller = new AbortController();
        uploads.add(controller);
        void fetch(upload.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", [CREATOR_WORKSPACE_ID_HEADER]: session.workspaceId },
            body: upload.body,
            signal: controller.signal,
        }).then(response => {
            if (active)
                channel.port1.postMessage({ id: upload.id, status: response.status });
        }).catch(() => {
            if (active)
                channel.port1.postMessage({ id: upload.id, error: "Preview upload failed" });
        }).finally(() => uploads.delete(controller));
    };
    channel.port1.start();
    let connected = false;
    let latestState;
    const controller = new AbortController();
    void fetch(CONNECTION_API, { headers: { [CREATOR_WORKSPACE_ID_HEADER]: session.workspaceId }, signal: controller.signal })
        .then(async (response) => { if (!response.ok)
        throw new Error("Preview connection unavailable"); return response.json(); })
        .then(state => { if (active) {
        connected = true;
        target.postMessage({ type, session: { ...session, previewSource: resolvePreviewAgentSource(latestState ?? state), creatorOrigin: location.origin } }, targetOrigin, [channel.port2]);
    } })
        .catch(() => undefined);
    const changed = (event) => {
        const detail = event.detail;
        if (active && detail.workspaceId === session.workspaceId) {
            latestState = detail.state;
            if (connected)
                channel.port1.postMessage({ type: "preview-source", source: resolvePreviewAgentSource(detail.state) });
        }
    };
    window.addEventListener("agent-ui-creator:connection-changed", changed);
    const requestPage = (event) => {
        const detail = event.detail;
        if (!active || !connected || detail?.workspaceId !== session.workspaceId || typeof detail.requestId !== "string")
            return;
        if (pageRequests.size >= 16)
            pageRequests.clear();
        pageRequests.add(detail.requestId);
        channel.port1.postMessage({ type: "business-page-url-request", requestId: detail.requestId });
    };
    window.addEventListener(CREATOR_BUSINESS_PAGE_REQUEST, requestPage);
    const observe = (event) => {
        const request = event.detail;
        const workspaceId = request?.workspaceId;
        if (active && connected && session.runtimeDiagnostics && isRuntimeObservationRequest(request) &&
            workspaceId === session.workspaceId && request.threadId === session.threadId) {
            channel.port1.postMessage({ type: "runtime-observation-request", request });
        }
    };
    window.addEventListener(CREATOR_OBSERVATION_REQUEST_EVENT, observe);
    return () => {
        active = false;
        controller.abort();
        window.removeEventListener("agent-ui-creator:connection-changed", changed);
        window.removeEventListener(CREATOR_BUSINESS_PAGE_REQUEST, requestPage);
        pageRequests.clear();
        window.removeEventListener(CREATOR_OBSERVATION_REQUEST_EVENT, observe);
        window.dispatchEvent(new CustomEvent("agent-ui-creator:preview-running", { detail: { running: false } }));
        for (const controller of uploads)
            controller.abort();
        channel.port1.close();
    };
}
//# sourceMappingURL=hostPreviewWorkbench.js.map