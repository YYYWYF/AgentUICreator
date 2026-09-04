import { randomUUID } from "node:crypto";

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  EventType,
  type AGUIEvent,
  type Message,
  type RunAgentInput,
} from "@ag-ui/core";

import { CreatorActivityRecorder } from "./CreatorActivityRecorder.js";
import {
  clearCreatorSummarizationEvent,
  createCreatorAgent,
  takeCreatorSummarizationEvent,
  type CreatorAgent,
} from "./createCreatorAgent.js";
import {
  createCreatorChatModel,
  loadCreatorModelConfig,
} from "./modelConfig.js";
import type { CreateProjectCreatorSessionOptions } from "./createProjectCreatorSession.js";
import { finalCreatorMessage } from "./CreatorSession.js";
import {
  CompositionFastPath,
  formatCompositionFastPathDiagnostic,
} from "./composition-fast-path/CompositionFastPath.js";
import type {
  CompositionFastPathHandler,
  CompositionFastPathResult,
} from "./composition-fast-path/types.js";
import {
  CreatorRunLogger,
  withCreatorDiagnosticLog,
} from "./CreatorRunLogger.js";
import { createCreatorToolCallId } from "./toolCallIds.js";
import type { CreatorRuntimeDiagnosticSession } from "./runtime-diagnostics/CreatorRuntimeDiagnosticStore.js";
import { ProjectControlAdapter } from "./project-control/ProjectControlAdapter.js";

const MAX_TOOL_RESULT_CHARACTERS = 12_000;

export interface CreatorAgUiRunOptions {
  signal?: AbortSignal | undefined;
}

interface MessageStream {
  text: AsyncIterable<string>;
}

interface ToolCallStream {
  callId: string;
  name: string;
  input: unknown;
  output: Promise<unknown>;
  status: Promise<"running" | "finished" | "error">;
  error: Promise<string | undefined>;
}

interface QueueWaiter<T> {
  resolve(result: IteratorResult<T>): void;
  reject(reason: unknown): void;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: QueueWaiter<T>[] = [];
  private closed = false;
  private failure: unknown;

  push(value: T): void {
    if (this.closed || this.failure !== undefined) {
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter === undefined) {
      this.values.push(value);
      return;
    }
    waiter.resolve({ value, done: false });
  }

  close(): void {
    if (this.closed || this.failure !== undefined) {
      return;
    }
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ value: undefined, done: true });
    }
  }

  fail(error: unknown): void {
    if (this.closed || this.failure !== undefined) {
      return;
    }
    this.failure = error;
    this.values.splice(0);
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(error);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return { next: () => this.next() };
  }

  private next(): Promise<IteratorResult<T>> {
    if (this.failure !== undefined) {
      return Promise.reject(this.failure);
    }
    if (this.values.length > 0) {
      return Promise.resolve({
        value: this.values.shift() as T,
        done: false,
      });
    }
    if (this.closed) {
      return Promise.resolve({ value: undefined, done: true });
    }

    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }
}

function contentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) => {
      if (
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return [part.text];
      }
      return [];
    })
    .join("\n");
}

function toolCallArguments(source: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("Creator 历史中的工具调用参数不是有效的 JSON。");
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Creator 历史中的工具调用参数必须是 JSON 对象。");
  }
  return value as Record<string, unknown>;
}

export function creatorLangChainMessages(messages: Message[]): BaseMessage[] {
  const result: BaseMessage[] = [];
  const usedToolCallIds = new Set<string>();
  let pending:
    | {
        assistant: AIMessage;
        calls: Array<{
          originalId: string;
          normalizedId: string;
          resolved: boolean;
        }>;
        results: ToolMessage[];
      }
    | undefined;

  const discardIncompleteToolTurn = (): void => {
    if (pending === undefined) {
      return;
    }
    if (contentText(pending.assistant.content).trim() !== "") {
      result.push(
        new AIMessage({
          content: pending.assistant.content,
          ...(pending.assistant.id === undefined
            ? {}
            : { id: pending.assistant.id }),
        }),
      );
    }
    pending = undefined;
  };

  for (const message of messages) {
    if (message.role !== "tool") {
      discardIncompleteToolTurn();
    }

    switch (message.role) {
      case "user":
        result.push(
          new HumanMessage({
            id: message.id,
            content: contentText(message.content),
          }),
        );
        break;
      case "assistant": {
        const calls = (message.toolCalls ?? []).map((toolCall) => {
          const providerId = toolCall.id.trim();
          const normalizedId =
            providerId !== "" && !usedToolCallIds.has(providerId)
              ? providerId
              : createCreatorToolCallId(usedToolCallIds);
          usedToolCallIds.add(normalizedId);
          return {
            originalId: toolCall.id,
            normalizedId,
            resolved: false,
            toolCall: {
              type: "tool_call" as const,
              id: normalizedId,
              name: toolCall.function.name,
              args: toolCallArguments(toolCall.function.arguments),
            },
          };
        });
        const assistant = new AIMessage({
          id: message.id,
          content: message.content ?? "",
          ...(calls.length === 0
            ? {}
            : { tool_calls: calls.map(({ toolCall }) => toolCall) }),
        });
        if (calls.length === 0) {
          result.push(assistant);
        } else {
          pending = {
            assistant,
            calls: calls.map(
              ({ originalId, normalizedId, resolved }) => ({
                originalId,
                normalizedId,
                resolved,
              }),
            ),
            results: [],
          };
        }
        break;
      }
      case "tool": {
        const call = pending?.calls.find(
          (candidate) =>
            !candidate.resolved && candidate.originalId === message.toolCallId,
        );
        if (pending === undefined || call === undefined) {
          break;
        }
        call.resolved = true;
        pending.results.push(
          new ToolMessage({
            id: message.id,
            content: message.content,
            tool_call_id: call.normalizedId,
            ...(message.error === undefined
              ? {}
              : { status: "error" as const }),
          }),
        );
        if (pending.calls.every((candidate) => candidate.resolved)) {
          result.push(pending.assistant, ...pending.results);
          pending = undefined;
        }
        break;
      }
      case "developer":
      case "system":
        result.push(
          new SystemMessage({
            id: message.id,
            content: message.content,
            ...(message.name === undefined ? {} : { name: message.name }),
          }),
        );
        break;
      case "activity":
      case "reasoning":
        break;
    }
  }

  discardIncompleteToolTurn();
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageId(message: BaseMessage): string {
  return message.id?.trim() || randomUUID();
}

function toolArguments(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "{}";
  } catch {
    return "{}";
  }
}

export function creatorAgUiMessages(messages: BaseMessage[]): Message[] {
  const usedToolCallIds = new Set<string>();
  return messages.flatMap((message): Message[] => {
    if (HumanMessage.isInstance(message)) {
      return [
        {
          id: messageId(message),
          role: "user",
          content: contentText(message.content),
        },
      ];
    }
    if (AIMessage.isInstance(message)) {
      return [
        {
          id: messageId(message),
          role: "assistant",
          content: contentText(message.content),
          ...(message.tool_calls === undefined || message.tool_calls.length === 0
            ? {}
            : {
                toolCalls: message.tool_calls.map((toolCall) => ({
                  id:
                    toolCall.id === undefined ||
                    toolCall.id.trim() === "" ||
                    usedToolCallIds.has(toolCall.id)
                      ? createCreatorToolCallId(usedToolCallIds)
                      : toolCall.id,
                  type: "function" as const,
                  function: {
                    name: toolCall.name,
                    arguments: toolArguments(toolCall.args),
                  },
                })).map((toolCall) => {
                  usedToolCallIds.add(toolCall.id);
                  return toolCall;
                }),
              }),
        },
      ];
    }
    if (ToolMessage.isInstance(message)) {
      return [
        {
          id: messageId(message),
          role: "tool",
          toolCallId: message.tool_call_id,
          content: contentText(message.content),
        },
      ];
    }
    if (SystemMessage.isInstance(message)) {
      return [
        {
          id: messageId(message),
          role: "system",
          content: contentText(message.content),
        },
      ];
    }
    return [];
  });
}

export function compactedCreatorMessages(
  output: unknown,
  summarizationEvent?: unknown,
): Message[] | undefined {
  if (!isRecord(output) || !Array.isArray(output.messages)) {
    return undefined;
  }
  const event = summarizationEvent ?? output._summarizationEvent;
  if (
    !isRecord(event) ||
    !Number.isInteger(event.cutoffIndex) ||
    (event.cutoffIndex as number) < 0 ||
    !HumanMessage.isInstance(event.summaryMessage)
  ) {
    return undefined;
  }

  const cutoffIndex = Math.min(event.cutoffIndex as number, output.messages.length);
  const preservedMessages = output.messages
    .slice(cutoffIndex)
    .filter((message): message is BaseMessage =>
      HumanMessage.isInstance(message) ||
      AIMessage.isInstance(message) ||
      ToolMessage.isInstance(message) ||
      SystemMessage.isInstance(message),
    );
  const [summary, ...preserved] = creatorAgUiMessages([
    event.summaryMessage,
    ...preservedMessages,
  ]);
  if (summary === undefined) {
    return undefined;
  }
  return [
    {
      ...summary,
      metadata: {
        ...(summary.metadata ?? {}),
        creatorContext: "summary",
      },
    },
    ...preserved,
  ];
}

function serializeToolValue(value: unknown): {
  content: string;
  truncated: boolean;
} {
  let content: string;
  if (typeof value === "string") {
    content = value;
  } else {
    try {
      content = JSON.stringify(value, null, 2) ?? String(value);
    } catch {
      content = String(value);
    }
  }

  if (content.length <= MAX_TOOL_RESULT_CHARACTERS) {
    return { content, truncated: false };
  }
  return {
    content: `${content.slice(0, MAX_TOOL_RESULT_CHARACTERS)}\n… 工具结果过长，已截断`,
    truncated: true,
  };
}

async function drainMessages(
  messages: AsyncIterable<MessageStream>,
): Promise<void> {
  for await (const message of messages) {
    for await (const delta of message.text) {
      void delta;
    }
  }
}

function emitAcceptedMessage(
  output: unknown,
  emit: (event: AGUIEvent) => void,
): string {
  const messageId = randomUUID();
  const text = finalCreatorMessage(
    output as { messages?: unknown[] | undefined },
  );
  emit({
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: "assistant",
  });
  emit({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: text,
  });
  emit({
    type: EventType.TEXT_MESSAGE_END,
    messageId,
  });
  return text;
}

async function streamToolCalls(
  toolCalls: AsyncIterable<ToolCallStream>,
  emit: (event: AGUIEvent) => void,
): Promise<void> {
  for await (const toolCall of toolCalls) {
    if (toolCall.callId === "") {
      throw new Error("Creator 模型返回了没有 ID 的结构化工具调用。");
    }

    emit({
      type: EventType.TOOL_CALL_START,
      toolCallId: toolCall.callId,
      toolCallName: toolCall.name,
    });
    emit({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: toolCall.callId,
      delta: JSON.stringify(toolCall.input),
    });
    emit({
      type: EventType.TOOL_CALL_END,
      toolCallId: toolCall.callId,
    });

    const [status, error] = await Promise.all([
      toolCall.status,
      toolCall.error,
    ]);
    let result: ReturnType<typeof serializeToolValue>;
    try {
      result = serializeToolValue(await toolCall.output);
    } catch (outputError) {
      result = serializeToolValue(
        outputError instanceof Error ? outputError.message : String(outputError),
      );
    }

    emit({
      type: EventType.TOOL_CALL_RESULT,
      messageId: randomUUID(),
      toolCallId: toolCall.callId,
      content: result.content,
      role: "tool",
      metadata: {
        status,
        ...(error === undefined ? {} : { error }),
        ...(result.truncated ? { truncated: true } : {}),
      },
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class CreatorAgUiAdapter {
  private running = false;

  constructor(
    private readonly agent: CreatorAgent,
    private readonly activity: CreatorActivityRecorder,
    private readonly runLogger?: CreatorRunLogger | undefined,
    private readonly runtimeDiagnostics?: CreatorRuntimeDiagnosticSession | undefined,
    private readonly compositionFastPath?: CompositionFastPathHandler | undefined,
  ) {}

  async *run(
    input: RunAgentInput,
    options: CreatorAgUiRunOptions = {},
  ): AsyncGenerator<AGUIEvent> {
    yield {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    };

    if (this.running) {
      yield {
        type: EventType.RUN_ERROR,
        message: "Creator 正在处理另一个请求。",
        code: "CREATOR_BUSY",
      };
      return;
    }

    this.running = true;
    this.runtimeDiagnostics?.beginThread(input.threadId);
    clearCreatorSummarizationEvent(this.agent);
    this.activity.begin(input.runId);
    await this.runLogger?.begin({
      source: "ag-ui",
      threadId: input.threadId,
      runId: input.runId,
      messages: input.messages,
    });

    try {
      const request = [...input.messages]
        .reverse()
        .find((message) => message.role === "user");
      const fastPathResult =
        this.compositionFastPath === undefined || request === undefined
          ? undefined
          : await this.compositionFastPath.tryHandle(
              contentText(request.content),
              options,
            );
      if (fastPathResult?.handled) {
        const messageId = randomUUID();
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: "assistant",
        };
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: fastPathResult.message,
        };
        yield { type: EventType.TEXT_MESSAGE_END, messageId };
        const receipt = withCreatorDiagnosticLog(
          await this.activity.finish(),
          this.runLogger,
        );
        await this.runLogger?.finish("success", {
          finalMessage: fastPathResult.message,
          receipt,
        });
        yield {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
          outcome: { type: "success" },
          result: { receipt },
        };
        return;
      }
      const agentMessages = generalAgentMessages(
        creatorLangChainMessages(input.messages),
        fastPathResult,
      );
      const run = await this.agent.streamEvents(
        { messages: agentMessages },
        {
          version: "v3",
          recursionLimit: 96,
          configurable: {
            thread_id: input.threadId,
            run_id: input.runId,
          },
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        },
      );
      const events = new AsyncEventQueue<AGUIEvent>();
      const execution = Promise.all([
        drainMessages(run.messages),
        streamToolCalls(run.toolCalls, (event) => events.push(event)),
        run.output,
      ])
        .then(async ([, , output]) => {
          const finalMessage = emitAcceptedMessage(output, (event) =>
            events.push(event),
          );
          const compactedMessages = compactedCreatorMessages(
            output,
            takeCreatorSummarizationEvent(this.agent),
          );
          if (compactedMessages !== undefined) {
            events.push({
              type: EventType.MESSAGES_SNAPSHOT,
              messages: compactedMessages,
              metadata: { source: "deepagents-summarization" },
            });
          }
          const receipt = withCreatorDiagnosticLog(
            await this.activity.finish(),
            this.runLogger,
          );
          await this.runLogger?.finish("success", {
            finalMessage,
            receipt,
          });
          events.push({
            type: EventType.RUN_FINISHED,
            threadId: input.threadId,
            runId: input.runId,
            outcome: { type: "success" },
            result: { receipt },
          });
          events.close();
        })
        .catch((error: unknown) => events.fail(error));

      try {
        for await (const event of events) {
          yield event;
        }
      } finally {
        await execution;
      }
    } catch (error) {
      let receipt;
      try {
        receipt = withCreatorDiagnosticLog(
          await this.activity.finish(),
          this.runLogger,
        );
      } catch (transactionError) {
        await this.runLogger?.record("transaction_persist_error", {
          error: transactionError,
        });
      }
      await this.runLogger?.finish(
        options.signal?.aborted ? "aborted" : "error",
        { error, receipt },
      );
      if (!options.signal?.aborted) {
        yield {
          type: EventType.RUN_ERROR,
          message: errorMessage(error),
          code: "CREATOR_RUN_FAILED",
        };
      }
    } finally {
      this.running = false;
    }
  }
}

export function createProjectCreatorAgUiAdapter({
  projectRoot,
  configRoot = process.cwd(),
  environment,
  runtimeDiagnostics,
}: CreateProjectCreatorSessionOptions): CreatorAgUiAdapter {
  const config = loadCreatorModelConfig({
    configRoot,
    ...(environment === undefined ? {} : { environment }),
  });
  const model = createCreatorChatModel(config);
  const activity = new CreatorActivityRecorder(projectRoot);
  const runLogger = new CreatorRunLogger({
    projectRoot,
    modelName: config.modelName,
  });
  const agent = createCreatorAgent({
    model,
    projectRoot,
    activity,
    runLogger,
    runtimeDiagnostics,
  });
  const compositionFastPath = new CompositionFastPath({
    model,
    adapter: new ProjectControlAdapter({ projectRoot }),
    activity,
    runLogger,
    runtimeDiagnostics,
  });
  return new CreatorAgUiAdapter(
    agent,
    activity,
    runLogger,
    runtimeDiagnostics,
    compositionFastPath,
  );
}

function generalAgentMessages(
  messages: BaseMessage[],
  fastPathResult: CompositionFastPathResult | undefined,
): BaseMessage[] {
  if (fastPathResult?.handled !== false || fastPathResult.diagnostic === undefined) {
    return messages;
  }
  const augmented = [...messages];
  const currentRequestIndex = augmented.reduce(
    (latest, message, index) =>
      HumanMessage.isInstance(message) ? index : latest,
    -1,
  );
  augmented.splice(
    Math.max(0, currentRequestIndex),
    0,
    new SystemMessage(
      formatCompositionFastPathDiagnostic(fastPathResult.diagnostic),
    ),
  );
  return augmented;
}
