import { randomUUID } from "node:crypto";

import { HttpAgent, type Message } from "@ag-ui/client";

import {
  PythonCreatorProcessManager,
  type PythonCreatorEndpoint,
  type PythonCreatorProcessManagerOptions,
} from "./PythonCreatorProcessManager.js";

export interface CreatePythonCreatorClientOptions
  extends PythonCreatorProcessManagerOptions {}

export interface PythonCreatorRunResult {
  message: string;
  result: unknown;
}

function messageText(content: Message["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .flatMap((part) =>
      typeof part === "object" &&
      part !== null &&
      "text" in part &&
      typeof part.text === "string"
        ? [part.text]
        : [],
    )
    .join("\n");
}

function finalAssistantMessage(messages: Message[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return messageText(message.content).trim();
    }
  }
  return "";
}

function endpointKey(endpoint: PythonCreatorEndpoint): string {
  return `${endpoint.host}:${endpoint.port}:${endpoint.authToken}`;
}

export class PythonCreatorClient {
  readonly #manager: PythonCreatorProcessManager;
  readonly #threadId = randomUUID();
  #agent: HttpAgent | undefined;
  #endpointKey: string | undefined;

  constructor(options: CreatePythonCreatorClientOptions) {
    this.#manager = new PythonCreatorProcessManager(options);
  }

  get processId(): number | undefined {
    return this.#manager.processId;
  }

  async run(request: string): Promise<PythonCreatorRunResult> {
    const prompt = request.trim();
    if (prompt === "") {
      throw new Error("Creator request must not be empty.");
    }

    const endpoint = await this.#manager.ensureStarted();
    const key = endpointKey(endpoint);
    if (this.#agent === undefined || this.#endpointKey !== key) {
      this.#agent = new HttpAgent({
        url: `http://${endpoint.host}:${endpoint.port}/creator`,
        headers: { Authorization: `Bearer ${endpoint.authToken}` },
        threadId: this.#threadId,
        ...(this.#agent === undefined
          ? {}
          : { initialMessages: this.#agent.messages }),
      });
      this.#endpointKey = key;
    }

    this.#agent.addMessage({
      id: randomUUID(),
      role: "user",
      content: prompt,
    });
    const run = await this.#agent.runAgent({});
    const message = finalAssistantMessage(run.newMessages);
    if (message === "") {
      throw new Error("Python Creator completed without an assistant message.");
    }
    return { message, result: run.result };
  }

  async dispose(): Promise<void> {
    this.#agent?.abortRun();
    await this.#manager.dispose();
  }
}

export function createPythonCreatorClient(
  options: CreatePythonCreatorClientOptions,
): PythonCreatorClient {
  return new PythonCreatorClient(options);
}
