import { CREATOR_RUNTIME_DIAGNOSTICS_API_PATH } from "../shared.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import type { RuntimePresentation } from "../host-preview/layoutPresentation.js";

export const MAX_CREATOR_RUNTIME_DIAGNOSTIC_REPORT_BYTES = 48 * 1_024;

export type CreatorRuntimeThreadId = string | (() => string);

export interface CreatorRuntimeDiagnosticReporterOptions {
  threadId: CreatorRuntimeThreadId;
  workspaceId?: string | undefined;
  endpoint?: string | undefined;
  fetch?: typeof globalThis.fetch;
}

function resolveThreadId(threadId: CreatorRuntimeThreadId): string {
  return typeof threadId === "function" ? threadId() : threadId;
}

export function createCreatorRuntimeDiagnosticReporter({
  threadId,
  workspaceId,
  endpoint = CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
  fetch: upload = globalThis.fetch,
}: CreatorRuntimeDiagnosticReporterOptions): (diagnostic: object) => void {
  return (diagnostic: object) => {
    let body: string;
    try {
      body = JSON.stringify({ threadId: resolveThreadId(threadId), diagnostic });
    } catch {
      return;
    }
    if (
      new TextEncoder().encode(body).byteLength >
      MAX_CREATOR_RUNTIME_DIAGNOSTIC_REPORT_BYTES
    ) {
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

export function createCreatorRuntimeCompositionReporter({
  threadId,
  workspaceId,
  endpoint = CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
  fetch: upload = globalThis.fetch,
}: CreatorRuntimeDiagnosticReporterOptions): (composition: object, observationRequestId?: string, presentation?: RuntimePresentation) => void {
  return (composition: object, observationRequestId?: string, presentation?: RuntimePresentation) => {
    let body: string;
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
    } catch {
      return;
    }
    if (
      new TextEncoder().encode(body).byteLength >
      MAX_CREATOR_RUNTIME_DIAGNOSTIC_REPORT_BYTES
    ) {
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
