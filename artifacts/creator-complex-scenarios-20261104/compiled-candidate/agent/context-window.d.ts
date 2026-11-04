import { BaseMessage } from "@langchain/core/messages";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import { CreatorContextArtifacts } from "./context-artifacts.js";
type Environment = Record<string, string | undefined>;
type Log = (event: string, data: object) => Promise<unknown>;
export interface ContextWindowOptions {
    environment: Environment;
    request: string;
    signal: () => AbortSignal;
    model: () => BaseLanguageModel;
    log: Log;
    workingContext?: (maxEstimatedTokens: number) => BaseMessage[];
}
/** Provider-independent byte heuristic, not a tokenizer or guaranteed upper bound. */
export declare function estimateContextTokens(value: unknown): number;
export declare function estimateMessageTokens(messages: BaseMessage[]): number;
/** A model-input projection only: original messages/checkpoints and all Host evidence remain intact. */
export declare class CreatorContextWindow {
    private readonly options;
    readonly stats: {
        summaryModelCalls: number;
        compactions: number;
        summarySeconds: number;
        offloadedArtifacts: number;
    };
    readonly artifacts: CreatorContextArtifacts;
    readonly budget: number;
    readonly keep: number;
    private cache;
    constructor(options: ContextWindowOptions);
    project(messages: BaseMessage[], tools: Parameters<typeof convertToOpenAITool>[0][], systemMessage?: BaseMessage): Promise<BaseMessage[]>;
}
export {};
//# sourceMappingURL=context-window.d.ts.map