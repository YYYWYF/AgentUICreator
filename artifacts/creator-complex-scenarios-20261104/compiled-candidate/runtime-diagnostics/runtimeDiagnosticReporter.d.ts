import type { RuntimePresentation } from "../host-preview/layoutPresentation.js";
export declare const MAX_CREATOR_RUNTIME_DIAGNOSTIC_REPORT_BYTES: number;
export type CreatorRuntimeThreadId = string | (() => string);
export interface CreatorRuntimeDiagnosticReporterOptions {
    threadId: CreatorRuntimeThreadId;
    workspaceId?: string | undefined;
    endpoint?: string | undefined;
    fetch?: typeof globalThis.fetch;
}
export declare function createCreatorRuntimeDiagnosticReporter({ threadId, workspaceId, endpoint, fetch: upload, }: CreatorRuntimeDiagnosticReporterOptions): (diagnostic: object) => void;
export declare function createCreatorRuntimeCompositionReporter({ threadId, workspaceId, endpoint, fetch: upload, }: CreatorRuntimeDiagnosticReporterOptions): (composition: object, observationRequestId?: string, presentation?: RuntimePresentation) => void;
//# sourceMappingURL=runtimeDiagnosticReporter.d.ts.map