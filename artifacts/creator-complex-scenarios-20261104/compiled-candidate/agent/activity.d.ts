import { type CreatorFileState } from "./files/creatorFileState.js";
import { CreatorFileObservationStore } from "./files/CreatorFileObservationStore.js";
export interface TransactionFile {
    path: string;
    status: string;
    before: CreatorFileState;
    after: CreatorFileState;
}
export interface Transaction {
    runId: string;
    createdAt: string;
    mutationRevision: number;
    validationRevision: number | null;
    files: TransactionFile[];
    createdDirectories?: string[];
    unrecoverablePaths?: string[];
}
export declare function sourceRoot(root: string): Promise<string>;
/** Logical project paths for command admission and recovery; no project mutation. */
export declare function projectCommandPaths(root: string): Promise<{
    source: string;
    model: string;
    settings: string;
    registry: string;
}>;
export declare function walk(root: string, relative: string, limit?: number, excluded?: Set<string>): Promise<string[]>;
export declare class RunActivity {
    readonly root: string;
    readonly runId: string;
    readonly signal: AbortSignal;
    readonly observations: CreatorFileObservationStore;
    readonly before: Map<string, CreatorFileState>;
    readonly after: Map<string, CreatorFileState>;
    readonly unrecoverablePaths: Set<string>;
    readonly createdDirectories: Set<string>;
    readonly logPath: string;
    private logTail;
    validations: any[];
    readonly recoveries: {
        runId: string;
        action: "undo" | "reapply";
        changedPaths: string[];
    }[];
    recordRecovery(runId: string, action: "undo" | "reapply", changedPaths: string[]): Promise<void>;
    private currentRevision;
    lastMutationAt: string | null;
    get revision(): number;
    set revision(value: number);
    validationRevision: number | null;
    constructor(root: string, runId: string, signal: AbortSignal);
    log(event: string, data?: object): Promise<void>;
    capture(file: string): Promise<void>;
    recordAfter(file: string, value: CreatorFileState): void;
    captureSource(): Promise<Map<string, CreatorFileState>>;
    observeOperatorChanges(previous: Map<string, CreatorFileState>, result?: Record<string, any>): Promise<void>;
    persist(): Promise<{
        files: {
            path: string;
            status: string;
            diff: string;
            truncated: boolean;
        }[];
        validations: any[];
        diagnosticLog: {
            format: string;
            path: string;
        };
        transaction: {
            runId: string;
            undoable: boolean;
            reapplyable: boolean;
            changedPaths: string[];
            conflicts: {
                path: string;
                expectedHash: string;
                actualHash: string;
            }[];
        };
        verification: {
            status: string;
            projectRevision: number;
            validationRevision: number | null;
            auditAttempts: number;
            checks: never[];
            verificationMode: string;
            runtimeStatus: string;
        };
    }>;
}
export declare function transactionPath(runId: string): string;
export declare function readTransaction(root: string, runId: string): Promise<Transaction>;
export declare function restoreTransaction(root: string, runId: string, action: "undo" | "reapply", signal?: AbortSignal, options?: {
    allowPartialUndo?: boolean;
}): Promise<{
    status: string;
    runId: string;
    changedPaths: string[];
    reapplyable: boolean;
}>;
//# sourceMappingURL=activity.d.ts.map