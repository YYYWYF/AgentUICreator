import { CREATOR_RUNTIME_DIAGNOSTICS_API_PATH } from "../shared.js";

export const MAX_CREATOR_RUNTIME_DIAGNOSTIC_REPORT_BYTES = 48 * 1_024;

export type CreatorRuntimeThreadId = string | (() => string);

export interface CreatorRuntimeDiagnosticReporterOptions {
  threadId: CreatorRuntimeThreadId;
  endpoint?: string | undefined;
}

function resolveThreadId(threadId: CreatorRuntimeThreadId): string {
  return typeof threadId === "function" ? threadId() : threadId;
}

export function createCreatorRuntimeDiagnosticReporter({
  threadId,
  endpoint = CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
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
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  };
}

export function createCreatorRuntimeCompositionReporter({
  threadId,
  endpoint = CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
}: CreatorRuntimeDiagnosticReporterOptions): (composition: object) => void {
  return (composition: object) => {
    let body: string;
    try {
      body = JSON.stringify({
        threadId: resolveThreadId(threadId),
        composition,
      });
    } catch {
      return;
    }
    if (
      new TextEncoder().encode(body).byteLength >
      MAX_CREATOR_RUNTIME_DIAGNOSTIC_REPORT_BYTES
    ) {
      return;
    }
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  };
}
