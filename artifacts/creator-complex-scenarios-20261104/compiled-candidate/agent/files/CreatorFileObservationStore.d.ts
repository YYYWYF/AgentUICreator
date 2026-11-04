import { type CreatorFileState } from "./creatorFileState.js";
export interface CreatorFileObservation {
    runId: string;
    path: string;
    exists: boolean;
    hash: string;
}
export declare class CreatorFileObservationError extends Error {
    readonly code: "read-before-edit" | "read-before-write" | "stale-version";
    readonly filePath: string;
    constructor(code: CreatorFileObservationError["code"], filePath: string, message: string);
}
export declare class CreatorFileObservationStore {
    private readonly projectRoot;
    private readonly observations;
    private runId;
    constructor(projectRoot: string);
    begin(runId: string): void;
    observe(filePath: string): Promise<CreatorFileObservation>;
    private record;
    observeStableRead<T>(filePath: string, read: () => Promise<T>, succeeded: (result: T) => boolean): Promise<T>;
    get(filePath: string): CreatorFileObservation | undefined;
    /** Discard a read that an aggregate operation could not return coherently. */
    forget(filePath: string): void;
    assertFreshForEdit(filePath: string): Promise<CreatorFileState>;
    assertFreshForWrite(filePath: string): Promise<CreatorFileState>;
    private assertFresh;
}
//# sourceMappingURL=CreatorFileObservationStore.d.ts.map