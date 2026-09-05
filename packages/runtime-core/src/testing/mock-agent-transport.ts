import type { AgentMessage } from "../agent-message.js";
import { ObservableAgentTransport } from "../observable-agent-transport.js";

export interface MockAgentTransportConfig {
  initialMessages?: AgentMessage[] | undefined;
  initialState?: unknown;
}

function createMessageId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export class MockAgentTransport extends ObservableAgentTransport {
  readonly mode = "mock" as const;

  private runVersion = 0;

  constructor(config: MockAgentTransportConfig = {}) {
    super({
      messages: [...(config.initialMessages ?? [])],
      state: config.initialState ?? {},
      isRunning: false,
      error: undefined,
    });
  }

  async sendMessage(input: string): Promise<void> {
    const message = input.trim();

    if (message.length === 0) {
      return;
    }

    if (this.snapshot.isRunning) {
      throw new Error("智能体运行时正在处理另一条消息。");
    }

    const runVersion = ++this.runVersion;

    this.publish({
      ...this.snapshot,
      messages: [
        ...this.snapshot.messages,
        {
          id: createMessageId("mock-user"),
          role: "user",
          content: message,
        },
      ],
      isRunning: true,
      error: undefined,
    });

    await Promise.resolve();

    if (runVersion !== this.runVersion) {
      return;
    }

    this.publish({
      ...this.snapshot,
      messages: [
        ...this.snapshot.messages,
        {
          id: createMessageId("mock-assistant"),
          role: "assistant",
          content: `Mock agent received: ${message}`,
        },
      ],
      isRunning: false,
    });
  }

  async startNewConversation(): Promise<void> {
    if (this.snapshot.isRunning) {
      throw new Error("智能体运行时正在处理另一条消息。");
    }

    this.publish({
      messages: [],
      state: {},
      isRunning: false,
      error: undefined,
    });
  }

  abort(): void {
    if (!this.snapshot.isRunning) {
      return;
    }

    this.runVersion += 1;
    this.publish({ ...this.snapshot, isRunning: false });
  }
}
