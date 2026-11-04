/** Recovery data describes existing read paths; it never grants access. */
export declare function readDenied(reason: string, scope: string): Error & {
    code: string;
    reason: string;
    scope: string;
    recovery: {
        action: string;
        retryable: boolean;
        alternatives: ({
            tool: string;
            purpose: string;
            input?: never;
        } | {
            tool: string;
            input: {
                path: string;
            };
            purpose: string;
        })[];
        interpretation: string;
    };
};
/** Share failures across ls/glob/grep/read_file, independently of unrelated reads. */
export declare class ToolRecovery {
    private readonly failures;
    private readonly emptySearches;
    private readonly fileRanges;
    private readonly frameworkReads;
    private guidance;
    recordGuidance(value: unknown): void;
    takeGuidance(): unknown;
    file(path: string, hash: string, start: number, end: number, revision: number, liveObservation?: boolean): unknown;
    failure(error: any): any;
    search(name: string, input: any, result: any, revision: number): {
        action: string;
        emptySearches: number;
        instruction: string;
    } | undefined;
}
/** Keep code/content/credentials out of telemetry while retaining read identities. */
export declare function toolReadIdentity(name: string, input: any): {
    [k: string]: any;
} | undefined;
//# sourceMappingURL=tool-recovery.d.ts.map