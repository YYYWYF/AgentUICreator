import type { AgentInputPart, AgentUserInput } from "../agent-input.js";
import type { AgentExecution } from "../agent-execution.js";
import type { AgentMessage } from "../agent-message.js";
import { ObservableAgentTransport } from "../observable-agent-transport.js";

export interface MockAgentTransportConfig<TState = unknown> {
  initialMessages?: AgentMessage[] | undefined;
  initialState?: TState | undefined;
  initialExecutions?: AgentExecution[] | undefined;
}

function createMessageId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function inputContentForMessage(
  content: AgentUserInput["content"],
): string | AgentInputPart[] | undefined {
  if (typeof content === "string") {
    const text = content.trim();
    return text.length === 0 ? undefined : text;
  }
  return content.length === 0 ? undefined : structuredClone(content);
}

function describeInput(content: string | AgentInputPart[]): string {
  if (typeof content === "string") return content;
  const text = content
    .filter((part): part is Extract<AgentInputPart, { type: "text" }> =>
      part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join(" ");
  const mediaCount =
    content.length - content.filter((part) => part.type === "text").length;
  return text || `${mediaCount} media attachment${mediaCount === 1 ? "" : "s"}`;
}

export class MockAgentTransport<TState = unknown>
  extends ObservableAgentTransport<TState> {
  readonly mode = "mock" as const;

  private runVersion = 0;

  constructor(config: MockAgentTransportConfig<TState> = {}) {
    super({
      conversation: { id: crypto.randomUUID() },
      messages: [...(config.initialMessages ?? [])],
      state: config.initialState ?? ({} as TState),
      run: { status: "idle" },
      executions: [...(config.initialExecutions ?? [])],
    });
  }

  async sendMessage(input: AgentUserInput): Promise<void> {
    const content = inputContentForMessage(input.content);

    if (content === undefined) {
      return;
    }

    if (this.snapshot.run.status === "running") {
      throw new Error("智能体运行时正在处理另一条消息。");
    }

    const runVersion = ++this.runVersion;

    this.publish({
      ...this.snapshot,
      messages: [
        ...this.snapshot.messages,
        {
          id: createMessageId("mock-user"),
          producer: { type: "root" },
          role: "user",
          content,
        },
      ],
      run: { id: crypto.randomUUID(), status: "running" },
      executions: [],
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
          producer: { type: "root" },
          role: "assistant",
          content: `Mock agent received: ${describeInput(content)}`,
        },
      ],
      run: { ...this.snapshot.run, status: "idle" },
    });
  }

  async startNewConversation(): Promise<void> {
    if (this.snapshot.run.status === "running") {
      throw new Error("智能体运行时正在处理另一条消息。");
    }

    this.publish({
      conversation: { id: crypto.randomUUID() },
      messages: [],
      state: {} as TState,
      run: { status: "idle" },
      executions: [],
    });
  }

  abort(): void {
    if (this.snapshot.run.status !== "running") {
      return;
    }

    this.runVersion += 1;
    this.publish({
      ...this.snapshot,
      run: { ...this.snapshot.run, status: "idle" },
    });
  }
}
