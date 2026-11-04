import { ChatOpenAICompletions, convertMessagesToCompletionsMessageParams } from "@langchain/openai";
import { reasoningContent } from "./reasoning-content.js";
const sourceMessages = Symbol("creator-chat-completions-source");
/** Preserve provider continuation data through the SDK's public conversion seam. */
export class CreatorChatCompletions extends ChatOpenAICompletions {
    _generate(messages, options, runManager) {
        // Non-streaming calls forward options.options; streaming calls forward the
        // outer options. Both carry per-call input without shared mutable state.
        return super._generate(messages, { ...options, [sourceMessages]: messages,
            options: { ...options.options, [sourceMessages]: messages } }, runManager);
    }
    async *_streamResponseChunks(messages, options, runManager) {
        yield* super._streamResponseChunks(messages, { ...options, [sourceMessages]: messages }, runManager);
    }
    async *_streamChatModelEvents(messages, options, runManager) {
        yield* super._streamChatModelEvents(messages, { ...options, [sourceMessages]: messages }, runManager);
    }
    completionWithRetry(request, options) {
        const { [sourceMessages]: originals, ...requestOptions } = (options ?? {});
        if (originals) {
            const requireReasoning = Boolean(request.tools?.length) && /deepseek/iu.test(request.model);
            let changed = false;
            const messages = originals.flatMap(message => {
                const reasoning = reasoningContent(message);
                return convertMessagesToCompletionsMessageParams({ messages: [message], model: request.model }).map(mapped => {
                    if (mapped.role !== "assistant" || (reasoning === undefined && !requireReasoning))
                        return mapped;
                    changed = true;
                    return { ...mapped, reasoning_content: reasoning ?? "" };
                });
            });
            if (changed)
                request = { ...request, messages };
        }
        return request.stream ? super.completionWithRetry(request, requestOptions) : super.completionWithRetry(request, requestOptions);
    }
}
//# sourceMappingURL=chat-completions.js.map