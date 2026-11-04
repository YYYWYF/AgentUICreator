import { ToolMessage, type BaseMessage } from "@langchain/core/messages";
/** Run-local immutable tool snapshots, never filesystem reads or authorization evidence. */
export declare class CreatorContextArtifacts {
    private readonly scope;
    private readonly records;
    get size(): number;
    archive(message: BaseMessage, toolName: string): {
        message: ToolMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>>;
        artifactId: string;
        created: boolean;
        originalCharacters: number;
    } | undefined;
    read(artifactId: string, path?: (string | number)[], offset?: number, limit?: number): {
        content: string;
        offset: number;
        nextOffset: number | null;
        totalCharacters: number;
        artifactId: string;
        historical: boolean;
        grantsFreshness: boolean;
        originalTool: string;
        path: (string | number)[];
        kind: string;
        keys: never[];
        keyCount: number;
        count: number;
    } | {
        content: string;
        offset: number;
        nextOffset: number | null;
        totalCharacters: number;
        artifactId: string;
        historical: boolean;
        grantsFreshness: boolean;
        originalTool: string;
        path: (string | number)[];
        kind: string;
        keys: string[];
        keyCount: number;
    };
}
//# sourceMappingURL=context-artifacts.d.ts.map