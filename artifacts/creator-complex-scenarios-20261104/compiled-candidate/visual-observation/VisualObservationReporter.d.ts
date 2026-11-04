export declare const MAX_VISUAL_OBSERVATION_REQUEST_BYTES: number;
export interface VisualObservationReporterOptions {
    endpoint?: string;
    workspaceId?: string | undefined;
    fetch?: typeof globalThis.fetch;
    onError?: (error: unknown) => void;
}
/** Host observation; the target App only reports a published hash and Preview root. */
export declare function createVisualObservationReporter({ endpoint, workspaceId, fetch: upload, onError, }?: VisualObservationReporterOptions): (currentHash: string, root: HTMLElement) => void;
//# sourceMappingURL=VisualObservationReporter.d.ts.map