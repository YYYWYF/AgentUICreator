export interface OperatorOperation {
    name: string;
    kind: "read" | "mutation";
    inputDef: string;
    resultDef: string;
    agentExposed: boolean;
}
export declare function requestOperator(root: string, operation: string, input?: object, signal?: AbortSignal): Promise<Record<string, any>>;
export declare function operatorContracts(directory: string): Promise<{
    operations: OperatorOperation[];
    inputSchema: (operation: OperatorOperation) => any;
}>;
//# sourceMappingURL=operator.d.ts.map