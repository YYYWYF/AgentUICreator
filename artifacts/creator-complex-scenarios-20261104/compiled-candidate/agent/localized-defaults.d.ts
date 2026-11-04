import path from "node:path";
interface Copy {
    property: string;
    namespace: string;
    value: string;
    line: number;
}
export interface LocalizedDefaultIssue extends Copy {
    path: string;
    code: "LOCALIZED_DEFAULT_REQUIRED";
    message: string;
}
export declare function snapshotPath(file: string, paths?: Pick<typeof path, "normalize" | "resolve">, realpath?: (file: string) => string): string;
/** Delta check for package-declared locale defaults, not a ban on UI/business strings. */
export declare function inspectLocalizedDefaults(root: string, changes: {
    path: string;
    before: string;
    after: string;
}[]): Promise<LocalizedDefaultIssue[]>;
export {};
//# sourceMappingURL=localized-defaults.d.ts.map