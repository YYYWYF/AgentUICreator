import type { ToolContext } from "./tools.js";
/** Recheck contents, not mtimes or just the Agent's mutation counter. */
export declare function projectCheckIdentity(root: string, signal: AbortSignal): Promise<string | undefined>;
export declare function runtimeObservationNavigation(project: Record<string, any>): {
    tool: string;
    toolGroup: string;
    enableIfNeeded: {
        tool: string;
        input: {
            groups: string[];
        };
    };
    input: {
        nodeRefs: any[];
    } | {};
    useWhen: string;
    coverage: string;
    evidenceBoundary: string;
};
export declare function inspectProject(context: ToolContext, input: Record<string, any>): Promise<any>;
/** Agent-facing projection only. Operator contracts and full observations stay intact. */
export declare function projectInspectionSummary(result: Record<string, any>): {
    authoringTargetCatalog?: any;
    creatorActions?: any;
    capabilitySummaries?: any;
    projection: {
        kind: string;
        omitted: string[];
        fullResult: {
            tool: string;
            input: {
                view?: string;
                detail: string;
            };
        };
        pluginDetails: string;
    };
};
//# sourceMappingURL=inspection.d.ts.map