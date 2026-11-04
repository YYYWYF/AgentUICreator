import type { ToolContext } from "./tools.js";
interface ServicePlan {
    id: string;
    spec: any;
    file: string;
    hash: string;
    status: "pending" | "ready" | "applied";
    sourceHash: string;
}
export declare function proposeService(context: ToolContext, input: any, proposedPlugins?: readonly string[]): Promise<ServicePlan>;
export declare function validateServiceProposal(context: ToolContext, id: string, proposedPlugins?: readonly string[]): Promise<void>;
/** Optional preflight for structured Service edits; ordinary project editing needs no approval. */
export declare function prepareService(context: ToolContext, input: any): Promise<{
    status: string;
    planId: string;
    spec: any;
    file: string;
}>;
export declare function applyService(context: ToolContext, input: any, kind: "create" | "mutate"): Promise<{
    changedPaths: string[];
    revision: number;
    planId: string;
    status: string;
    verificationRequired: boolean;
}>;
export {};
//# sourceMappingURL=service-tools.d.ts.map