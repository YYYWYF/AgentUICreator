import { type CreatorFileState } from "./files/creatorFileState.js";
import type { ToolContext } from "./tools.js";
export interface Candidate {
    path: string;
    before: CreatorFileState;
    content: string;
}
export declare function pluginFile(pluginId: string, relative: string, source: string): string;
export declare function applyEdits(content: string, edits: any[]): string;
export declare function commitBatch(context: ToolContext, candidates: Candidate[]): Promise<{
    changedPaths: string[];
    revision: number;
}>;
export declare function createPlugin(context: ToolContext, input: any): Promise<{
    changedPaths: string[];
    revision: number;
}>;
export declare function mutatePlugin(context: ToolContext, input: any, authorize: (file: string) => Promise<string>): Promise<{
    changedPaths: string[];
    revision: number;
}>;
//# sourceMappingURL=source-tools.d.ts.map