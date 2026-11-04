import { ChatOpenAICompletions, type OpenAIClient } from "@langchain/openai";
import type { BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
type Options = ChatOpenAICompletions["ParsedCallOptions"];
type StreamingRequest = OpenAIClient.Chat.Completions.ChatCompletionCreateParamsStreaming;
type PlainRequest = OpenAIClient.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
/** Preserve provider continuation data through the SDK's public conversion seam. */
export declare class CreatorChatCompletions extends ChatOpenAICompletions {
    _generate(messages: BaseMessage[], options: Options, runManager?: CallbackManagerForLLMRun): Promise<import("@langchain/core/outputs").ChatResult>;
    _streamResponseChunks(messages: BaseMessage[], options: Options, runManager?: CallbackManagerForLLMRun): AsyncGenerator<import("@langchain/core/outputs").ChatGenerationChunk, void, any>;
    _streamChatModelEvents(messages: BaseMessage[], options: Options, runManager?: CallbackManagerForLLMRun): AsyncGenerator<import("@langchain/core/language_models/event").ChatModelStreamEvent, void, any>;
    completionWithRetry(request: StreamingRequest, options?: OpenAIClient.RequestOptions): Promise<AsyncIterable<OpenAIClient.Chat.Completions.ChatCompletionChunk>>;
    completionWithRetry(request: PlainRequest, options?: OpenAIClient.RequestOptions): Promise<OpenAIClient.Chat.Completions.ChatCompletion>;
}
export {};
//# sourceMappingURL=chat-completions.d.ts.map