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
  createCreatorAgent,
  type CreatorAgent,
} from "./createCreatorAgent.js";
import {
  createCreatorChatModel,
  loadCreatorModelConfig,
} from "./modelConfig.js";
import type { CreateProjectCreatorSessionOptions } from "./createProjectCreatorSession.js";
import { createCreatorToolCallId } from "./toolCallIds.js";

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

async function streamMessages(
  messages: AsyncIterable<MessageStream>,
  emit: (event: AGUIEvent) => void,
): Promise<void> {
  for await (const message of messages) {
    const messageId = randomUUID();
    let started = false;

    for await (const delta of message.text) {
      if (delta === "") {
        continue;
      }
      if (!started) {
        started = true;
        emit({
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: "assistant",
        });
      }
      emit({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta,
      });
    }

    if (started) {
      emit({
        type: EventType.TEXT_MESSAGE_END,
        messageId,
      });
    }
  }
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
    this.activity.begin();

    try {
      const run = await this.agent.streamEvents(
        { messages: creatorLangChainMessages(input.messages) },
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
        streamMessages(run.messages, (event) => events.push(event)),
        streamToolCalls(run.toolCalls, (event) => events.push(event)),
        run.output,
      ])
        .then(async () => {
          const receipt = await this.activity.finish();
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
}: CreateProjectCreatorSessionOptions): CreatorAgUiAdapter {
  const model = createCreatorChatModel(
    loadCreatorModelConfig({
      configRoot,
      ...(environment === undefined ? {} : { environment }),
    }),
  );
  const activity = new CreatorActivityRecorder(projectRoot);
  const agent = createCreatorAgent({ model, projectRoot, activity });
  return new CreatorAgUiAdapter(agent, activity);
}
