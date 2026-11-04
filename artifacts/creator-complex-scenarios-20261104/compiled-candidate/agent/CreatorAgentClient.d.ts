import { type AgentSubscriber, type Message, type RunAgentResult } from "@ag-ui/client";
import { type CreatorQuestionActivity } from "./creatorInterruptTypes.js";
export type CreatorRunSubscriber = Omit<AgentSubscriber, "onCustomEvent"> & {
    onQuestion?: (question: CreatorQuestionActivity) => void;
    onQuestionResumed?: (interruptId: string) => void;
};
/** Creator AG-UI client and question activity boundary. */
export declare class CreatorAgentClient {
    #private;
    constructor(workspaceId: string, threadId: string, initialMessages?: Message[]);
    get threadId(): string;
    get messages(): Message[];
    get currentRunId(): string | undefined;
    addMessage(message: Message): void;
    abort(): void;
    run(subscriber: CreatorRunSubscriber, runId?: string): Promise<RunAgentResult>;
    reconnect(runId: string, subscriber: CreatorRunSubscriber): Promise<RunAgentResult>;
    resumeInterrupt(interruptId: string, answers: Record<string, string[]>, subscriber: CreatorRunSubscriber, runId?: string): Promise<RunAgentResult>;
    control(action: "stop" | "abandon", interruptId?: string): Promise<"stopping" | "abandoned">;
    undo(runId: string): Promise<{
        changedPaths: string[];
        reapplyable: boolean;
    }>;
    reapply(runId: string): Promise<string[]>;
}
//# sourceMappingURL=CreatorAgentClient.d.ts.map