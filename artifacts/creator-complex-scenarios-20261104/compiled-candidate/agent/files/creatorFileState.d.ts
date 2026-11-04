export declare const CREATOR_MISSING_FILE_HASH: string;
export interface CreatorProjectFileLocation {
    absolutePath: string;
    receiptPath: string;
}
export interface CreatorFileState {
    exists: boolean;
    hash: string;
    content?: string | undefined;
}
export declare class CreatorFileStateConflictError extends Error {
    constructor(filePath: string);
}
export declare function creatorContentHash(content: string | Uint8Array): string;
export declare function resolveCreatorProjectFile(projectRoot: string, filePath: string): CreatorProjectFileLocation;
export declare function readCreatorFileState(projectRoot: string, filePath: string): Promise<CreatorFileState>;
export declare function replaceCreatorFileAtomically(projectRoot: string, filePath: string, content: string, expected?: Pick<CreatorFileState, "exists" | "hash"> | undefined, signal?: AbortSignal): Promise<void>;
export declare function createCreatorFileAtomically(projectRoot: string, filePath: string, content: string, signal?: AbortSignal): Promise<void>;
export declare function removeCreatorFile(projectRoot: string, filePath: string, expected?: Pick<CreatorFileState, "exists" | "hash"> | undefined): Promise<void>;
//# sourceMappingURL=creatorFileState.d.ts.map