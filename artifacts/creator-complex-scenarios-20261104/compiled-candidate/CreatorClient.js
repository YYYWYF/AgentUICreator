import { randomUUID } from "node:crypto";
import { HttpAgent } from "@ag-ui/client";
import { CreatorProcessManager, } from "./CreatorProcessManager.js";
function messageText(content) {
    if (typeof content === "string") {
        return content;
    }
    if (!Array.isArray(content)) {
        return "";
    }
    return content
        .flatMap((part) => typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof part.text === "string"
        ? [part.text]
        : [])
        .join("\n");
}
function finalAssistantMessage(messages) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role === "assistant") {
            return messageText(message.content).trim();
        }
    }
    return "";
}
function endpointKey(endpoint) {
    return `${endpoint.host}:${endpoint.port}:${endpoint.authToken}`;
}
export class CreatorClient {
    #manager;
    #threadId = randomUUID();
    #agent;
    #endpointKey;
    constructor(options) {
        this.#manager = new CreatorProcessManager(options);
    }
    get processId() {
        return this.#manager.processId;
    }
    async run(request) {
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
            throw new Error("Creator completed without an assistant message.");
        }
        return { message, result: run.result };
    }
    async dispose() {
        this.#agent?.abortRun();
        await this.#manager.dispose();
    }
}
export function createCreatorClient(options) {
    return new CreatorClient(options);
}
//# sourceMappingURL=CreatorClient.js.map