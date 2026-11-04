import { MemorySaver } from "@langchain/langgraph";
import { type ToolContext } from "./tools.js";
import { EditingSessionStore } from "./editing-session.js";
export interface AgentInput {
    threadId: string;
    runId: string;
    messages: any[];
    forwardedProps?: {
        command?: {
            resume?: {
                interruptId: string;
                answers: Record<string, string[]>;
            };
        };
    };
}
export type Publish = (event: Record<string, any>) => Promise<void>;
export interface PendingQuestion {
    envelope: any;
    checkpointId: string;
    context: ToolContext;
    graph: any;
}
export declare class CreatorAgentRuntime {
    readonly root: string;
    readonly skills: string;
    readonly contracts: string;
    readonly checkpointer: MemorySaver;
    readonly pending: Map<string, PendingQuestion>;
    readonly diagnostics: Map<string, any>;
    readonly editingSessions: EditingSessionStore;
    readonly environment: Record<string, string | undefined>;
    readonly mode: string;
    readonly verificationMode: string;
    constructor(root: string, skills: string, contracts: string, configRoot?: string);
    abandon(threadId: string, interruptId: string): Promise<void>;
    private classify;
    run(input: AgentInput, signal: AbortSignal, publish: Publish, cancelMarker?: string): Promise<void>;
}
export declare function validateAnswers(steps: any[], answers: Record<string, string[]>): void;
//# sourceMappingURL=runner.d.ts.map