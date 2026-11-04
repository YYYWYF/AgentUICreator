import type { ToolContext } from "./tools.js";
export declare function prepareServiceImplementation(context: ToolContext, input: {
    implementationPath: string;
    edits: {
        oldText: string;
        newText: string;
        replaceAll?: boolean;
    }[];
    impactSummary: string;
}): Promise<{
    status: string;
    changed: boolean;
    planId?: never;
    implementationPath?: never;
    affectedFiles?: never;
    affectedPlugins?: never;
    unresolvedImports?: never;
    verificationRequired?: never;
} | {
    changed?: never;
    status: string;
    planId: string;
    implementationPath: string;
    affectedFiles: string[];
    affectedPlugins: string[];
    unresolvedImports: {
        file: string;
        specifier: string;
    }[];
    verificationRequired: boolean;
}>;
export declare function applyServiceImplementation(context: ToolContext, input: {
    planId: string;
}): Promise<{
    changedPaths: string[];
    revision: number;
    status: string;
    verificationRequired: boolean;
}>;
//# sourceMappingURL=service-implementation-tools.d.ts.map