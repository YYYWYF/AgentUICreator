import type { ToolContext } from "./tools.js";
export declare function logicalProjectPath(file: string): string;
export declare function resolveReadPath(context: Pick<ToolContext, "root" | "skills">, file: string): Promise<{
    target: string;
    name: string;
    skill: boolean;
}>;
/** All Agent source reads, including prefetched reads, share the same evidence boundary. */
export declare function readProjectFile(context: ToolContext, input: {
    file_path: string;
    offset?: number;
    limit?: number;
}, maxChars?: number): Promise<{
    path: string;
    content: string;
    hash: string;
    totalLines: number;
    rangeStatus?: string;
    firstOffset?: number;
    lastOffset?: number;
    nextOffset: number | null;
}>;
export declare function forgetReadEvidence(context: ToolContext, files: readonly string[]): void;
//# sourceMappingURL=project-read.d.ts.map