import type { ToolContext } from "./tools.js";
export interface SourceNavigation {
    path?: string;
    role: string;
    from?: string;
    specifier?: string;
    status: "read" | "unread" | "external" | "unresolved" | "protected" | "unavailable";
    nextRead?: {
        tool: string;
        input: {
            file_path: string;
            offset: number;
            limit: number;
        };
    };
}
export declare const sourceRead: (file: string, offset?: number) => {
    tool: string;
    input: {
        file_path: string;
        offset: number;
        limit: number;
    };
};
/** Literal module references only. This is navigation, never an API/behavior inference. */
export declare function localModuleReferences(source: string): string[];
/** Return bounded fresh reads plus explicit continuation for everything omitted. */
export declare function readEditingSources(context: ToolContext, source: string, seeds: {
    path: string;
    role: string;
}[]): Promise<{
    files: {
        path: string;
        content: string;
        hash: string;
        totalLines: number;
        rangeStatus?: string;
        firstOffset?: number;
        lastOffset?: number;
        nextOffset: number | null;
    }[];
    unavailableFiles: {
        path: string;
        code: string;
    }[];
    navigation: SourceNavigation[];
    sourcesComplete: boolean;
}>;
//# sourceMappingURL=edit-context-sources.d.ts.map