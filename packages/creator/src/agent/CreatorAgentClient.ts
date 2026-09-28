import { HttpAgent, type AgentSubscriber, type Message, type RunAgentResult } from "@ag-ui/client";
import { CREATOR_API_PATH } from "../shared.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import { questionFromInterrupt, type CreatorQuestionActivity } from "./creatorInterruptTypes.js";

export type CreatorRunSubscriber = Omit<AgentSubscriber, "onCustomEvent"> & {
  onQuestion?: (question: CreatorQuestionActivity) => void;
};

/** The only Creator boundary that knows AG-UI 0.0.59 interrupt wire fields. */
export class CreatorAgentClient {
  readonly #agent: HttpAgent;

  constructor(workspaceId: string, threadId: string, initialMessages: Message[] = []) {
    this.#agent = new HttpAgent({ url: CREATOR_API_PATH,
      headers: { [CREATOR_WORKSPACE_ID_HEADER]: workspaceId }, threadId, initialMessages });
  }

  get threadId(): string { return this.#agent.threadId; }
  get messages(): Message[] { return this.#agent.messages; }
  addMessage(message: Message): void { this.#agent.addMessage(message); }
  abort(): void { this.#agent.abortRun(); }

  run(subscriber: CreatorRunSubscriber): Promise<RunAgentResult> {
    return this.#agent.runAgent({}, this.#subscriber(subscriber));
  }

  resumeInterrupt(interruptId: string, answers: Record<string, string[]>, subscriber: CreatorRunSubscriber): Promise<RunAgentResult> {
    return this.#agent.runAgent({ forwardedProps: { command: { resume: { interruptId, answers } } } }, this.#subscriber(subscriber));
  }

  #subscriber({ onQuestion, ...subscriber }: CreatorRunSubscriber): AgentSubscriber {
    return { ...subscriber, onCustomEvent({ event }) {
      if (event.name !== "on_interrupt") return;
      const question = questionFromInterrupt(event.value);
      if (question !== undefined) onQuestion?.(question);
    } };
  }
}
