import { randomUUID } from "node:crypto";

import type { CreatorRunReceipt } from "./receiptTypes.js";

export interface CreatorConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CreatorInvocationResult {
  messages?: unknown[] | undefined;
  receipt?: CreatorRunReceipt | undefined;
}

export type CreatorInvoker = (
  messages: CreatorConversationMessage[],
) => Promise<CreatorInvocationResult>;

export interface CreatorStreamObserver {
  onTextMessageStart(messageId: string): void;
  onTextMessageContent(messageId: string, delta: string): void;
  onTextMessageEnd(messageId: string): void;
}

export interface CreatorStreamOptions {
  signal?: AbortSignal | undefined;
}

export type CreatorStreamInvoker = (
  messages: CreatorConversationMessage[],
  observer: CreatorStreamObserver,
  options: CreatorStreamOptions,
) => Promise<CreatorInvocationResult>;

export interface CreatorRunResult {
  message: string;
  receipt?: CreatorRunReceipt | undefined;
}

export class CreatorModelProtocolError extends Error {
  constructor() {
    super(
      "Creator 模型把工具调用作为文本返回，而不是结构化工具调用。请配置支持结构化工具调用的 OpenAI 兼容模型。",
    );
    this.name = "CreatorModelProtocolError";
  }
}

function messageType(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) {
    return undefined;
  }

  const getType = (message as { _getType?: unknown })._getType;
  if (typeof getType === "function") {
    return String(getType.call(message));
  }

  const role = (message as { role?: unknown }).role;
  if (typeof role === "string") {
    return role;
  }

  const type = (message as { type?: unknown }).type;
  return typeof type === "string" ? type : undefined;
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

export function finalCreatorMessage(result: CreatorInvocationResult): string {
  const assistantMessage = [...(result.messages ?? [])]
    .reverse()
    .find((message) => {
      const type = messageType(message);
      return type === "ai" || type === "assistant";
    });

  if (assistantMessage === undefined) {
    throw new Error("Creator 模型已结束运行，但没有返回助手消息。");
  }

  const content = contentText(
    (assistantMessage as { content?: unknown }).content,
  ).trim();

  if (/<tool_call>|<function=|"tool_calls"\s*:/iu.test(content)) {
    throw new CreatorModelProtocolError();
  }

  if (content === "") {
    throw new Error("Creator 模型已结束运行，但没有返回文本响应。");
  }

  return content;
}

export class CreatorSession {
  private history: CreatorConversationMessage[] = [];
  private running = false;

  constructor(
    private readonly invoke: CreatorInvoker,
    private readonly streamInvoke?: CreatorStreamInvoker | undefined,
  ) {}

  async run(input: string): Promise<CreatorRunResult> {
    return this.execute(input, (messages) => this.invoke(messages));
  }

  async stream(
    input: string,
    observer: CreatorStreamObserver,
    options: CreatorStreamOptions = {},
  ): Promise<CreatorRunResult> {
    return this.execute(input, async (messages) => {
      if (this.streamInvoke !== undefined) {
        return this.streamInvoke(messages, observer, options);
      }

      const result = await this.invoke(messages);
      const message = finalCreatorMessage(result);
      const messageId = randomUUID();
      observer.onTextMessageStart(messageId);
      observer.onTextMessageContent(messageId, message);
      observer.onTextMessageEnd(messageId);
      return result;
    });
  }

  private async execute(
    input: string,
    invoke: CreatorInvoker,
  ): Promise<CreatorRunResult> {
    const request = input.trim();
    if (request === "") {
      throw new Error("Creator 请求不能为空。");
    }
    if (this.running) {
      throw new Error("Creator 正在处理另一个请求。");
    }

    this.running = true;
    const userMessage: CreatorConversationMessage = {
      role: "user",
      content: request,
    };

    try {
      const result = await invoke([...this.history, userMessage]);
      const message = finalCreatorMessage(result);
      const assistantMessage: CreatorConversationMessage = {
        role: "assistant",
        content: message,
      };
      this.history = [
        ...this.history,
        userMessage,
        assistantMessage,
      ].slice(-12);
      return {
        message,
        ...(result.receipt === undefined ? {} : { receipt: result.receipt }),
      };
    } finally {
      this.running = false;
    }
  }
}
