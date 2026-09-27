import { CREATOR_RUNTIME_DIAGNOSTICS_API_PATH, CREATOR_VISUAL_OBSERVATION_API_PATH } from "../shared.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import { HOST_PREVIEW_CONNECT, type HostPreviewSession, type PreviewUpload } from "./protocol.js";

/** Each iframe load / selected thread gets its own port and immutable workspace identity. */
export function connectCreatorHostPreview(
  frame: HTMLIFrameElement,
  session: Omit<HostPreviewSession, "creatorOrigin">,
): () => void {
  const target = frame.contentWindow;
  if (target === null) return () => undefined;
  const channel = new MessageChannel();
  const uploads = new Set<AbortController>();
  let active = true;
  channel.port1.onmessage = (event: MessageEvent<PreviewUpload>) => {
    const upload = event.data;
    if (!active || !upload || !Number.isSafeInteger(upload.id) || typeof upload.body !== "string" || upload.body.length > 1_048_576) return;
    const runtime = upload.endpoint === CREATOR_RUNTIME_DIAGNOSTICS_API_PATH && session.runtimeDiagnostics;
    const visual = upload.endpoint === CREATOR_VISUAL_OBSERVATION_API_PATH && session.visualObservation;
    if (!runtime && !visual) return;
    if (runtime) {
      try { if (JSON.parse(upload.body).threadId !== session.threadId) return; }
      catch { return; }
    }
    const controller = new AbortController();
    uploads.add(controller);
    void fetch(upload.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", [CREATOR_WORKSPACE_ID_HEADER]: session.workspaceId },
      body: upload.body,
      signal: controller.signal,
    }).then(response => {
      if (active) channel.port1.postMessage({ id: upload.id, status: response.status });
    }).catch(() => {
      if (active) channel.port1.postMessage({ id: upload.id, error: "Preview upload failed" });
    }).finally(() => uploads.delete(controller));
  };
  channel.port1.start();
  target.postMessage({ type: HOST_PREVIEW_CONNECT, session: { ...session, creatorOrigin: location.origin } }, new URL(frame.src, location.href).origin, [channel.port2]);
  return () => {
    active = false;
    for (const controller of uploads) controller.abort();
    channel.port1.close();
  };
}
