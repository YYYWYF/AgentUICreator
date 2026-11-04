import { ChatOpenAICompletions, convertMessagesToCompletionsMessageParams, type OpenAIClient } from "@langchain/openai";
import type { BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { reasoningContent } from "./reasoning-content.js";

const sourceMessages = Symbol("creator-chat-completions-source");
type Options = ChatOpenAICompletions["ParsedCallOptions"];
type SourceOptions = Options & { [sourceMessages]?: BaseMessage[] };
type StreamingRequest = OpenAIClient.Chat.Completions.ChatCompletionCreateParamsStreaming;
type PlainRequest = OpenAIClient.Chat.Completions.ChatCompletionCreateParamsNonStreaming;

/** Preserve provider continuation data through the SDK's public conversion seam. */
export class CreatorChatCompletions extends ChatOpenAICompletions {
  override _generate(messages: BaseMessage[], options: Options, runManager?: CallbackManagerForLLMRun) {
    // Non-streaming calls forward options.options; streaming calls forward the
    // outer options. Both carry per-call input without shared mutable state.
    return super._generate(messages, { ...options, [sourceMessages]: messages,
      options: { ...options.options, [sourceMessages]: messages } } as SourceOptions, runManager);
  }

  override async *_streamResponseChunks(messages: BaseMessage[], options: Options, runManager?: CallbackManagerForLLMRun) {
    yield* super._streamResponseChunks(messages, { ...options, [sourceMessages]: messages } as SourceOptions, runManager);
  }

  override async *_streamChatModelEvents(messages: BaseMessage[], options: Options, runManager?: CallbackManagerForLLMRun) {
    yield* super._streamChatModelEvents(messages, { ...options, [sourceMessages]: messages } as SourceOptions, runManager);
  }

  override completionWithRetry(request: StreamingRequest, options?: OpenAIClient.RequestOptions): Promise<AsyncIterable<OpenAIClient.Chat.Completions.ChatCompletionChunk>>;
  override completionWithRetry(request: PlainRequest, options?: OpenAIClient.RequestOptions): Promise<OpenAIClient.Chat.Completions.ChatCompletion>;
  override completionWithRetry(request: StreamingRequest | PlainRequest, options?: OpenAIClient.RequestOptions) {
    const { [sourceMessages]: originals, ...requestOptions } = (options ?? {}) as OpenAIClient.RequestOptions & Pick<SourceOptions, typeof sourceMessages>;
    if (originals) {
      const requireReasoning = Boolean(request.tools?.length) && /deepseek/iu.test(request.model);
      let changed = false;
      const messages = originals.flatMap(message => {
        const reasoning = reasoningContent(message);
        return convertMessagesToCompletionsMessageParams({ messages: [message], model: request.model }).map(mapped => {
          if (mapped.role !== "assistant" || (reasoning === undefined && !requireReasoning)) return mapped;
          changed = true;
          return { ...mapped, reasoning_content: reasoning ?? "" };
        });
      });
      if (changed) request = { ...request, messages };
    }
    return request.stream ? super.completionWithRetry(request, requestOptions) : super.completionWithRetry(request, requestOptions);
  }
}
