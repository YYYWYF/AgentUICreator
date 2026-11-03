import { HttpAgent, type AgentSubscriber, type Message, type RunAgentResult } from "@ag-ui/client";
import { CREATOR_API_PATH, CREATOR_CONTROL_API_PATH } from "../shared.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import { questionFromInterrupt, type CreatorQuestionActivity } from "./creatorInterruptTypes.js";
import { CREATOR_OBSERVATION_REQUEST_EVENT, isRuntimeObservationRequest } from "../host-preview/protocol.js";
import { fetchCreatorRun } from "./creatorRunTransport.js";

export type CreatorRunSubscriber = Omit<AgentSubscriber, "onCustomEvent"> & {
  onQuestion?: (question: CreatorQuestionActivity) => void;
  onQuestionResumed?: (interruptId: string) => void;
};

/** Creator AG-UI client and question activity boundary. */
export class CreatorAgentClient {
  readonly #agent: HttpAgent;
  readonly #workspaceId: string;
  #currentRunId: string | undefined;
  #reconnecting = false;

  constructor(workspaceId: string, threadId: string, initialMessages: Message[] = []) {
    this.#workspaceId = workspaceId;
    this.#agent = new HttpAgent({ url: CREATOR_API_PATH,
      headers: { [CREATOR_WORKSPACE_ID_HEADER]: workspaceId }, threadId, initialMessages,
      fetch: (_url, init) => fetchCreatorRun(init, this.#reconnecting) });
  }

  get threadId(): string { return this.#agent.threadId; }
  get messages(): Message[] { return this.#agent.messages; }
  get currentRunId(): string | undefined { return this.#currentRunId; }
  addMessage(message: Message): void { this.#agent.addMessage(message); }
  abort(): void { this.#agent.abortRun(); }

  run(subscriber: CreatorRunSubscriber, runId: string = crypto.randomUUID()): Promise<RunAgentResult> {
    this.#reconnecting = false;
    this.#currentRunId = runId;
    return this.#agent.runAgent({ runId }, this.#subscriber(subscriber));
  }

  reconnect(runId: string, subscriber: CreatorRunSubscriber): Promise<RunAgentResult> {
    this.#reconnecting = true;
    this.#currentRunId = runId;
    return this.#agent.runAgent({ runId }, this.#subscriber(subscriber));
  }

  resumeInterrupt(interruptId: string, answers: Record<string, string[]>, subscriber: CreatorRunSubscriber, runId: string = crypto.randomUUID()): Promise<RunAgentResult> {
    this.#reconnecting = false;
    this.#currentRunId = runId;
    return this.#agent.runAgent({ runId, forwardedProps: { command: { resume: { interruptId, answers } } } }, this.#subscriber(subscriber));
  }

  async control(action: "stop" | "abandon", interruptId?: string): Promise<"stopping" | "abandoned"> {
    const response = await fetch(CREATOR_CONTROL_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", [CREATOR_WORKSPACE_ID_HEADER]: this.#workspaceId },
      body: JSON.stringify({ action, threadId: this.threadId,
        ...(interruptId === undefined ? { runId: this.#currentRunId } : { interruptId }) }),
    });
    const body: unknown = await response.json();
    if (!response.ok || typeof body !== "object" || body === null || !("status" in body)) {
      throw new Error(typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error : "Creator 停止请求未被接受。");
    }
    return body.status === "abandoned" ? "abandoned" : "stopping";
  }

  async undo(runId: string): Promise<{ changedPaths: string[]; reapplyable: boolean }> {
    return this.#changeRunFiles("undo", "undone", runId);
  }

  async reapply(runId: string): Promise<string[]> {
    return (await this.#changeRunFiles("reapply", "reapplied", runId)).changedPaths;
  }

  async #changeRunFiles(
    action: "undo" | "reapply", status: "undone" | "reapplied", runId: string,
  ): Promise<{ changedPaths: string[]; reapplyable: boolean }> {
    const response = await fetch(CREATOR_CONTROL_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", [CREATOR_WORKSPACE_ID_HEADER]: this.#workspaceId },
      body: JSON.stringify({ action, threadId: this.threadId, runId }),
    });
    const body: unknown = await response.json();
    if (!response.ok || typeof body !== "object" || body === null || !("status" in body) || body.status !== status) {
      const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error : `Creator ${action === "undo" ? "撤销" : "再次应用"}请求未被接受。`;
      const conflicts = typeof body === "object" && body !== null && "details" in body &&
        typeof body.details === "object" && body.details !== null && "conflicts" in body.details &&
        Array.isArray(body.details.conflicts) ? body.details.conflicts.map((item: unknown) =>
          typeof item === "object" && item !== null && "path" in item ? String(item.path) : "").filter(Boolean) : [];
      throw new Error(conflicts.length > 0 ? `${message} 冲突文件：${conflicts.join("、")}` : message);
    }
    return {
      changedPaths: "changedPaths" in body && Array.isArray(body.changedPaths)
        ? body.changedPaths.filter((path): path is string => typeof path === "string") : [],
      reapplyable: "reapplyable" in body && body.reapplyable === true,
    };
  }

  #subscriber({ onQuestion, onQuestionResumed, ...subscriber }: CreatorRunSubscriber): AgentSubscriber {
    const workspaceId = this.#workspaceId, threadId = this.threadId;
    return { ...subscriber, onCustomEvent({ event }) {
      if (event.name === "creator_runtime_observation_requested" && isRuntimeObservationRequest(event.value) && event.value.threadId === threadId) {
        window.dispatchEvent(new CustomEvent(CREATOR_OBSERVATION_REQUEST_EVENT, { detail: { ...event.value, workspaceId } }));
        return;
      }
      if (event.name === "on_interrupt_resumed" && typeof event.value === "object" && event.value !== null &&
          "interruptId" in event.value && typeof event.value.interruptId === "string") {
        onQuestionResumed?.(event.value.interruptId);
        return;
      }
      if (event.name !== "on_interrupt") return;
      const question = questionFromInterrupt(event.value);
      if (question !== undefined) onQuestion?.(question);
    } };
  }
}
