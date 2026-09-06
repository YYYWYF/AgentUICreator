import type { AgentInputPart, AgentUserInput } from "../agent-input.js";
import type { AgentApplicationEvent } from "../agent-application-event.js";
import type { AgentExecution } from "../agent-execution.js";
import type {
  AgentInterrupt,
  AgentInterruptResponse,
} from "../agent-interrupt.js";
import type { AgentMessage } from "../agent-message.js";
import { ObservableAgentTransport } from "../observable-agent-transport.js";

export interface MockAgentTransportConfig<TState = unknown> {
  initialMessages?: AgentMessage[] | undefined;
  initialState?: TState | undefined;
  initialExecutions?: AgentExecution[] | undefined;
  initialInterrupts?: AgentInterrupt[] | undefined;
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
    const interrupts = [...(config.initialInterrupts ?? [])];
    super({
      conversation: { id: crypto.randomUUID() },
      messages: [...(config.initialMessages ?? [])],
      state: config.initialState ?? ({} as TState),
      run: { status: interrupts.length > 0 ? "awaiting-input" : "idle" },
      executions: [...(config.initialExecutions ?? [])],
      interrupts,
    });
  }

  emitApplicationEvent(event: AgentApplicationEvent): void {
    super.emitApplicationEvent(event);
  }

  async sendMessage(input: AgentUserInput): Promise<void> {
    if (this.snapshot.interrupts.length > 0) {
      throw new Error(
        "当前会话正在等待用户响应，请先处理 pending interrupts。",
      );
    }

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
      interrupts: [],
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

  async resumeInterrupts(
    responses: AgentInterruptResponse[],
  ): Promise<void> {
    if (this.snapshot.interrupts.length === 0) {
      throw new Error("No pending interrupts");
    }
    if (this.snapshot.run.status === "running") {
      throw new Error("Cannot resume interrupts while the agent is running");
    }

    const responseIds = responses.map((response) => response.interruptId);
    const uniqueResponseIds = new Set(responseIds);
    if (uniqueResponseIds.size !== responseIds.length) {
      throw new Error("Interrupt responses must not contain duplicate IDs");
    }
    const pendingIds = new Set(
      this.snapshot.interrupts.map((interrupt) => interrupt.id),
    );
    const unknownId = responseIds.find((id) => !pendingIds.has(id));
    if (unknownId !== undefined) {
      throw new Error(`Unknown interrupt response ID: ${unknownId}`);
    }
    const missingId = this.snapshot.interrupts.find(
      (interrupt) => !uniqueResponseIds.has(interrupt.id),
    )?.id;
    if (missingId !== undefined) {
      throw new Error(`Missing response for pending interrupt: ${missingId}`);
    }

    const runVersion = ++this.runVersion;
    this.publish({
      ...this.snapshot,
      run: { id: crypto.randomUUID(), status: "running" },
    });

    await Promise.resolve();

    if (runVersion !== this.runVersion) {
      return;
    }
    this.publish({
      ...this.snapshot,
      run: { ...this.snapshot.run, status: "idle" },
      interrupts: [],
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
      interrupts: [],
    });
  }

  abort(): void {
    if (this.snapshot.run.status === "awaiting-input") {
      return;
    }
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
