export declare function retryKind(error: unknown): "short" | "fresh" | undefined;
export declare function retryDelay(milliseconds: number, signal: AbortSignal): Promise<void>;
/** Project only redundant inspection payloads. Checkpoints, user constraints,
 * source reads, approvals, errors and mutation receipts remain unchanged. */
export declare function compactToolContext(messages: any[]): any[];
//# sourceMappingURL=model-policy.d.ts.map