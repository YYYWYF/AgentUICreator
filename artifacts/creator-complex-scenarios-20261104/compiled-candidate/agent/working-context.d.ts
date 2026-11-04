import { HumanMessage } from "@langchain/core/messages";
import type { ToolContext } from "./tools.js";
export interface SourceSnapshot {
    path: string;
    hash: string;
    content: string;
    start: number;
    end: number;
    truncated: boolean;
}
/** Host decisions survive lossy history summaries; they never imply fresh source or wider permission. */
export declare function workingDevelopmentContext(context: ToolContext, maximumTokens: number): HumanMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>>[];
export declare function workingContext(context: ToolContext, maximumTokens: number): HumanMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>>[];
/** Cache only text actually returned by a same-run read. This does not read files or grant evidence. */
export declare function rememberSourceRead(context: ToolContext, result: {
    path: string;
    hash: string;
    content: string;
    nextOffset: number | null;
    totalLines: number;
}, offset: number): void;
/** Keep the working source outside lossy summaries, within the same model-input budget. */
export declare function workingSourceContext(context: ToolContext, maxEstimatedTokens: number): HumanMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>>[];
//# sourceMappingURL=working-context.d.ts.map