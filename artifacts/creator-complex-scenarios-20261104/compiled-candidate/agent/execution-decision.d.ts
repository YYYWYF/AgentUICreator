import type { ToolContext } from "./tools.js";
/** A user decision ends this request, not the conversation or future requests. */
export declare function cancelExecution(context: ToolContext, toolName: string): {
    status: string;
    reason: string;
    retryable: boolean;
};
export declare function assertExecutionOpen(context: ToolContext): void;
export interface RemovalTarget {
    status: "not_requested" | "resolved" | "unresolved";
    description: string;
    pluginIds: string[];
}
export declare const removalTargetSchema: {
    type: string;
    additionalProperties: boolean;
    properties: {
        status: {
            type: string;
            enum: string[];
        };
        description: {
            type: string;
        };
        pluginIds: {
            type: string;
            items: {
                type: string;
            };
        };
    };
    required: string[];
};
export declare function parseRemovalTarget(value: any, plugins: readonly {
    pluginId: string;
}[]): RemovalTarget;
export declare function removalInstanceIds(input: any, project: any): Set<string>;
/** Compare exact instance/slot identities, never fuzzy-match a feature in a tool argument. */
export declare function assertRemovalScope(target: RemovalTarget | undefined, operation: string, input: any, project: any): void;
/** Keep a reversible off switch from becoming structural deletion. The
 * Operator still owns the original operation semantics and transaction. */
export declare function assertInstanceRetention(request: string, input: any, project: any, plugins?: NonNullable<ToolContext["pluginNames"]>): void;
//# sourceMappingURL=execution-decision.d.ts.map