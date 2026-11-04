import type { RunAgentInput } from "@ag-ui/core";
interface AgentPlanActivity {
    title: string;
    steps: readonly {
        id: string;
        label: string;
        description: string;
    }[];
    activeIndex: number;
}
type Event = Record<string, unknown>;
type Listener = (event: Event) => void;
interface DurableRun {
    threadId: string;
    runId: string;
    scenarioId: "resumable-long-run" | "resumable-agent-plan";
    userText: string;
    runCount: number;
    completed: boolean;
    activity?: AgentPlanActivity;
    events: Event[];
    listeners: Set<Listener>;
    completionListeners: Set<() => void>;
}
/** Shared by the two development HTTP plugins in one Vite server process. */
export declare class MockDurableRunStore {
    private readonly runs;
    start(input: RunAgentInput, scenarioId?: DurableRun["scenarioId"]): DurableRun;
    private updateAgentPlan;
    private finish;
    list(): {
        id: string;
        title: string;
        runCount: number;
    }[];
    snapshot(id: string): {
        threadId: string;
        runId: string;
        runCount: number;
        userText: string;
        scenarioId: "resumable-agent-plan" | "resumable-long-run";
        assistantText: string;
        activity?: AgentPlanActivity;
        resumable: boolean;
    } | undefined;
    subscribeEvents(id: string, listener: Listener, onComplete: () => void): () => void;
    /** Reattach to a live AgentPlan run from its latest complete Activity snapshot. */
    subscribeAgentPlanResume(id: string, listener: Listener, onComplete: () => void): () => void;
    subscribeContinuation(id: string, listener: (text: string) => void): () => void;
}
export declare const mockDurableRuns: MockDurableRunStore;
export {};
//# sourceMappingURL=durable-run-store.d.ts.map