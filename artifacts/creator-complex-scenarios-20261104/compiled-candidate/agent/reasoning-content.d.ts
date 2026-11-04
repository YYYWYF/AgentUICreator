import { type BaseMessage } from "@langchain/core/messages";
/** The two representations produced by the pinned Chat Completions adapter. */
export declare function reasoningContent(message: BaseMessage): string | undefined;
/** Native content blocks already participate in the existing context estimate. */
export declare function reasoningOutsideContent(message: BaseMessage): string | undefined;
//# sourceMappingURL=reasoning-content.d.ts.map