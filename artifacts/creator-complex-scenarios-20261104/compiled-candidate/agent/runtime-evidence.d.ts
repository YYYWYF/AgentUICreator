import type { ToolContext } from "./tools.js";
export declare function runtimeIdentity(item: any): any;
export declare function runtimeTargetId(item: any): string;
export declare function recordRuntimeEvidence(store: Map<string, any>, input: any): void;
export declare function inspectRuntime(context: ToolContext, options?: {
    includeStale?: boolean;
    instanceIds?: string | string[];
    nodeRefs?: string | string[];
    refresh?: boolean;
}): Promise<{
    currentHash: any;
    runtimeStatus: string;
    compositionFresh: boolean;
    diagnosticFresh: boolean;
    runtimeObserved: boolean;
    currentErrors: any[];
    resolvedCurrent: any[];
    observationRefresh: {
        status: string;
        requestId?: string;
        reason?: string;
    };
    filterEncodingNormalized?: boolean;
    presentationCoverage: {
        status: any;
        reason: any;
        truncated: any;
        interpretation: string;
    } | {
        truncated?: never;
        interpretation?: never;
        status: string;
        reason: string;
    };
    unavailableReasons?: (string | undefined)[];
    recovery?: {
        action: string;
        retryable: boolean;
        instruction: string;
    };
    summary: {
        currentOpenCount: number;
        truncated: boolean;
    };
    stale?: any[];
    observedAt?: any;
    viewport?: any;
    application?: any;
    instances?: any;
    layoutNodes?: any;
    interpretation: string;
}>;
//# sourceMappingURL=runtime-evidence.d.ts.map