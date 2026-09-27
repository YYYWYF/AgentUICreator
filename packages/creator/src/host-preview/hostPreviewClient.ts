import { createCreatorRuntimeCompositionReporter, createCreatorRuntimeDiagnosticReporter } from "../runtime-diagnostics/runtimeDiagnosticReporter.js";
import { createVisualObservationReporter } from "../visual-observation/VisualObservationReporter.js";
import { AGENT_UI_OBSERVATION_EVENT, AGENT_UI_OBSERVATION_REQUEST_EVENT, HOST_PREVIEW_CONNECT, isHostPreviewSession, type PreviewUploadResult } from "./protocol.js";

type Observation =
  | { type: "runtime-composition"; composition: object & { appUIModelHash?: string } }
  | { type: "runtime-diagnostic"; diagnostic: object & { appUIModelHash?: string; instanceId?: string; kind?: string; eventName?: string } }
  | { type: "preview-committed"; appUIModelHash: string; root: HTMLElement };

/** Dev client only. Standalone Hosts render without a Creator connection. */
export function installCreatorHostPreviewBridge(): () => void {
  let disposeSession: () => void = () => undefined;
  let report: ((observation: Observation) => void) | undefined;
  let preview: Extract<Observation, { type: "preview-committed" }> | undefined;
  let composition: Extract<Observation, { type: "runtime-composition" }> | undefined;
  const diagnostics = new Map<string, Extract<Observation, { type: "runtime-diagnostic" }>>();
  const observe = (event: Event) => {
    const observation = (event as CustomEvent<Observation>).detail;
    if (!observation || typeof observation !== "object") return;
    switch (observation.type) {
      case "preview-committed":
        if (!(observation.root instanceof HTMLElement) || !/^[a-f0-9]{64}$/.test(observation.appUIModelHash)) return;
        if (preview?.appUIModelHash !== observation.appUIModelHash) {
          if (composition?.composition.appUIModelHash !== observation.appUIModelHash) composition = undefined;
        }
        preview = observation;
        break;
      case "runtime-composition": composition = observation; break;
      case "runtime-diagnostic":
        diagnostics.set(`${observation.diagnostic.appUIModelHash}:${observation.diagnostic.kind}:${observation.diagnostic.instanceId}:${observation.diagnostic.eventName}`, observation);
        if (diagnostics.size > 128) diagnostics.delete(diagnostics.keys().next().value!);
        break;
      default: return;
    }
    report?.(observation);
  };
  const connect = (event: MessageEvent) => {
    if (window.parent === window || !new URLSearchParams(location.search).has("creator-preview")) return;
    if (event.source !== window.parent || event.data?.type !== HOST_PREVIEW_CONNECT || !isHostPreviewSession(event.data.session)) return;
    const session = event.data.session;
    if (event.origin !== session.creatorOrigin || !document.referrer || new URL(document.referrer).origin !== event.origin) return;
    const port = event.ports[0];
    if (port === undefined) return;
    disposeSession();
    let nextId = 0;
    let active = true;
    const pending = new Map<number, { resolve: (response: Response) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    const upload: typeof fetch = (_input, init) => new Promise<Response>((resolve, reject) => {
      if (!active) { reject(new Error("Preview session closed")); return; }
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("Preview upload timed out")); }, 15_000);
      pending.set(id, { resolve, reject, timer });
      port.postMessage({ id, endpoint: String(_input), body: String(init?.body ?? "") });
    });
    port.onmessage = (reply: MessageEvent<PreviewUploadResult>) => {
      const request = pending.get(reply.data?.id);
      if (!request) return;
      pending.delete(reply.data.id);
      clearTimeout(request.timer);
      if (reply.data.error || typeof reply.data.status !== "number" || !Number.isInteger(reply.data.status) || reply.data.status < 200 || reply.data.status > 599) request.reject(new Error(reply.data.error || "Invalid preview response"));
      else request.resolve(new Response(null, { status: reply.data.status }));
    };
    port.start();
    const options = { workspaceId: session.workspaceId, threadId: session.threadId, fetch: upload };
    const diagnostic = createCreatorRuntimeDiagnosticReporter(options);
    const runtimeComposition = createCreatorRuntimeCompositionReporter(options);
    const visual = createVisualObservationReporter({ workspaceId: session.workspaceId, fetch: upload });
    report = observation => {
      if (observation.type === "runtime-diagnostic" && session.runtimeDiagnostics) diagnostic(observation.diagnostic);
      if (observation.type === "runtime-composition" && session.runtimeDiagnostics) runtimeComposition(observation.composition);
      if (observation.type === "preview-committed" && session.visualObservation) visual(observation.appUIModelHash, observation.root);
    };
    disposeSession = () => {
      active = false;
      report = undefined;
      port.close();
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("Preview session changed"));
      }
      pending.clear();
    };
    window.dispatchEvent(new Event(AGENT_UI_OBSERVATION_REQUEST_EVENT));
    // Replay after connecting, including observations published before the dev adapter loaded.
    if (preview?.root.isConnected) report(preview);
    if (composition) report(composition);
    for (const diagnostic of diagnostics.values()) report(diagnostic);
  };
  window.addEventListener(AGENT_UI_OBSERVATION_EVENT, observe);
  window.addEventListener("message", connect);
  window.dispatchEvent(new Event(AGENT_UI_OBSERVATION_REQUEST_EVENT));
  return () => {
    disposeSession();
    window.removeEventListener(AGENT_UI_OBSERVATION_EVENT, observe);
    window.removeEventListener("message", connect);
  };
}

const bridgeKey = "__agentUiCreatorHostPreviewDispose";
const bridgeWindow = window as Window & { [bridgeKey]?: () => void };
bridgeWindow[bridgeKey]?.();
bridgeWindow[bridgeKey] = installCreatorHostPreviewBridge();
