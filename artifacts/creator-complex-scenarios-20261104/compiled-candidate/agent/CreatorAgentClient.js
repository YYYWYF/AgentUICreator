import { HttpAgent } from "@ag-ui/client";
import { CREATOR_API_PATH, CREATOR_CONTROL_API_PATH } from "../shared.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import { questionFromInterrupt } from "./creatorInterruptTypes.js";
import { CREATOR_OBSERVATION_REQUEST_EVENT, isRuntimeObservationRequest } from "../host-preview/protocol.js";
import { fetchCreatorRun } from "./creatorRunTransport.js";
/** Creator AG-UI client and question activity boundary. */
export class CreatorAgentClient {
    #agent;
    #workspaceId;
    #currentRunId;
    #reconnecting = false;
    constructor(workspaceId, threadId, initialMessages = []) {
        this.#workspaceId = workspaceId;
        this.#agent = new HttpAgent({ url: CREATOR_API_PATH,
            headers: { [CREATOR_WORKSPACE_ID_HEADER]: workspaceId }, threadId, initialMessages,
            fetch: (_url, init) => fetchCreatorRun(init, this.#reconnecting) });
    }
    get threadId() { return this.#agent.threadId; }
    get messages() { return this.#agent.messages; }
    get currentRunId() { return this.#currentRunId; }
    addMessage(message) { this.#agent.addMessage(message); }
    abort() { this.#agent.abortRun(); }
    run(subscriber, runId = crypto.randomUUID()) {
        this.#reconnecting = false;
        this.#currentRunId = runId;
        return this.#agent.runAgent({ runId }, this.#subscriber(subscriber));
    }
    reconnect(runId, subscriber) {
        this.#reconnecting = true;
        this.#currentRunId = runId;
        return this.#agent.runAgent({ runId }, this.#subscriber(subscriber));
    }
    resumeInterrupt(interruptId, answers, subscriber, runId = crypto.randomUUID()) {
        this.#reconnecting = false;
        this.#currentRunId = runId;
        return this.#agent.runAgent({ runId, forwardedProps: { command: { resume: { interruptId, answers } } } }, this.#subscriber(subscriber));
    }
    async control(action, interruptId) {
        const response = await fetch(CREATOR_CONTROL_API_PATH, {
            method: "POST",
            headers: { "Content-Type": "application/json", [CREATOR_WORKSPACE_ID_HEADER]: this.#workspaceId },
            body: JSON.stringify({ action, threadId: this.threadId,
                ...(interruptId === undefined ? { runId: this.#currentRunId } : { interruptId }) }),
        });
        const body = await response.json();
        if (!response.ok || typeof body !== "object" || body === null || !("status" in body)) {
            throw new Error(typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
                ? body.error : "Creator 停止请求未被接受。");
        }
        return body.status === "abandoned" ? "abandoned" : "stopping";
    }
    async undo(runId) {
        return this.#changeRunFiles("undo", "undone", runId);
    }
    async reapply(runId) {
        return (await this.#changeRunFiles("reapply", "reapplied", runId)).changedPaths;
    }
    async #changeRunFiles(action, status, runId) {
        const response = await fetch(CREATOR_CONTROL_API_PATH, {
            method: "POST",
            headers: { "Content-Type": "application/json", [CREATOR_WORKSPACE_ID_HEADER]: this.#workspaceId },
            body: JSON.stringify({ action, threadId: this.threadId, runId }),
        });
        const body = await response.json();
        if (!response.ok || typeof body !== "object" || body === null || !("status" in body) || body.status !== status) {
            const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
                ? body.error : `Creator ${action === "undo" ? "撤销" : "再次应用"}请求未被接受。`;
            const conflicts = typeof body === "object" && body !== null && "details" in body &&
                typeof body.details === "object" && body.details !== null && "conflicts" in body.details &&
                Array.isArray(body.details.conflicts) ? body.details.conflicts.map((item) => typeof item === "object" && item !== null && "path" in item ? String(item.path) : "").filter(Boolean) : [];
            throw new Error(conflicts.length > 0 ? `${message} 冲突文件：${conflicts.join("、")}` : message);
        }
        return {
            changedPaths: "changedPaths" in body && Array.isArray(body.changedPaths)
                ? body.changedPaths.filter((path) => typeof path === "string") : [],
            reapplyable: "reapplyable" in body && body.reapplyable === true,
        };
    }
    #subscriber({ onQuestion, onQuestionResumed, ...subscriber }) {
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
                if (event.name !== "on_interrupt")
                    return;
                const question = questionFromInterrupt(event.value);
                if (question !== undefined)
                    onQuestion?.(question);
            } };
    }
}
//# sourceMappingURL=CreatorAgentClient.js.map