export declare function matchesGlob(name: string, pattern: string): boolean;
export declare function regexSearch(files: {
    path: string;
    content: string;
}[], pattern: string, signal: AbortSignal): Promise<{
    path: string;
    matches: {
        line: number;
        text: string;
    }[];
    count: number;
}[]>;
//# sourceMappingURL=search.d.ts.map