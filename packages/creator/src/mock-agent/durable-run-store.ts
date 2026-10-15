import type { RunAgentInput } from "@ag-ui/core";

const FIRST = "正在分析第一部分……";
const REST = "第二部分完成……任务完成";
const DURATION_MS = 9000;
const AGENT_PLAN_FIRST_UPDATE_MS = 700;
const AGENT_PLAN_CONTINUATION_MS = 9000;
const AGENT_PLAN_FINISH_UPDATE_MS = 700;
const AGENT_PLAN_MESSAGE_ID = "agent-plan-1";
const AGENT_PLAN_ACTIVITY_TYPE = "agent-plan";

interface AgentPlanActivity {
  title: string;
  steps: readonly { id: string; label: string; description: string }[];
  activeIndex: number;
}

const INITIAL_AGENT_PLAN: AgentPlanActivity = {
  title: "Workspace update",
  steps: [
    { id: "inspect", label: "Inspect", description: "Analyze the active files." },
    { id: "modify", label: "Modify", description: "Apply the requested changes." },
    { id: "test", label: "Test", description: "Check the focused regressions." },
  ],
  activeIndex: 0,
};

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

function userText(input: RunAgentInput): string {
  const last = [...input.messages].reverse().find(message => message.role === "user");
  if (last === undefined) return "执行一个长任务";
  return typeof last.content === "string" ? last.content
    : last.content.filter(part => part.type === "text").map(part => part.text).join("");
}

/** Shared by the two development HTTP plugins in one Vite server process. */
export class MockDurableRunStore {
  private readonly runs = new Map<string, DurableRun>();

  start(
    input: RunAgentInput,
    scenarioId: DurableRun["scenarioId"] = "resumable-long-run",
  ): DurableRun {
    const previous = this.runs.get(input.threadId);
    const run: DurableRun = {
      threadId: input.threadId, runId: input.runId, scenarioId, userText: userText(input),
      runCount: (previous?.runCount ?? 0) + 1, completed: false,
      ...(scenarioId === "resumable-agent-plan"
        ? { activity: structuredClone(INITIAL_AGENT_PLAN) }
        : {}),
      events: [], listeners: new Set(), completionListeners: new Set(),
    };
    this.runs.set(input.threadId, run);
    const emit = (event: Event) => {
      run.events.push(event);
      run.listeners.forEach(listener => listener(event));
    };
    emit({ type: "RUN_STARTED", threadId: run.threadId, runId: run.runId });
    if (scenarioId === "resumable-agent-plan") {
      emit({
        type: "ACTIVITY_SNAPSHOT",
        threadId: run.threadId,
        runId: run.runId,
        messageId: AGENT_PLAN_MESSAGE_ID,
        activityType: AGENT_PLAN_ACTIVITY_TYPE,
        replace: true,
        content: structuredClone(run.activity!),
      });
      setTimeout(() => {
        this.updateAgentPlan(run, emit, 1);
        setTimeout(() => {
          this.updateAgentPlan(run, emit, 2);
          setTimeout(() => {
            this.updateAgentPlan(run, emit, 3);
            this.finish(run, emit);
          }, AGENT_PLAN_FINISH_UPDATE_MS);
        }, AGENT_PLAN_CONTINUATION_MS);
      }, AGENT_PLAN_FIRST_UPDATE_MS);
      return run;
    }

    emit({ type: "TEXT_MESSAGE_START", messageId: `${run.runId}-answer`, role: "assistant" });
    emit({ type: "TEXT_MESSAGE_CONTENT", messageId: `${run.runId}-answer`, delta: FIRST });
    setTimeout(() => {
      emit({ type: "TEXT_MESSAGE_CONTENT", messageId: `${run.runId}-answer`, delta: REST });
      emit({ type: "TEXT_MESSAGE_END", messageId: `${run.runId}-answer` });
      this.finish(run, emit);
    }, DURATION_MS);
    return run;
  }

  private updateAgentPlan(
    run: DurableRun,
    emit: (event: Event) => void,
    activeIndex: number,
  ): void {
    if (run.completed || run.activity === undefined) return;
    run.activity = { ...run.activity, activeIndex };
    emit({
      type: "ACTIVITY_DELTA",
      threadId: run.threadId,
      runId: run.runId,
      messageId: AGENT_PLAN_MESSAGE_ID,
      activityType: AGENT_PLAN_ACTIVITY_TYPE,
      patch: [{ op: "replace", path: "/activeIndex", value: activeIndex }],
    });
  }

  private finish(run: DurableRun, emit: (event: Event) => void): void {
    if (run.completed) return;
    emit({ type: "RUN_FINISHED", threadId: run.threadId, runId: run.runId });
    run.completed = true;
    run.completionListeners.forEach(listener => listener());
    run.completionListeners.clear();
  }

  list() {
    return [...this.runs.values()].map(run => ({
      id: run.threadId,
      title: run.scenarioId === "resumable-agent-plan"
        ? "AgentPlan Activity：刷新后继续"
        : "长任务：刷新后继续",
      runCount: run.runCount,
    }));
  }

  snapshot(id: string) {
    const run = this.runs.get(id);
    if (run === undefined) return undefined;
    return {
      threadId: id, runId: run.runId, runCount: run.runCount,
      userText: run.userText,
      scenarioId: run.scenarioId,
      assistantText: run.scenarioId === "resumable-long-run"
        ? FIRST + (run.completed ? REST : "")
        : "",
      ...(run.activity === undefined ? {} : { activity: structuredClone(run.activity) }),
      resumable: !run.completed,
    };
  }

  subscribeEvents(id: string, listener: Listener, onComplete: () => void): () => void {
    const run = this.runs.get(id);
    if (run === undefined) throw new Error(`Unknown durable run: ${id}`);
    run.events.forEach(listener);
    if (run.completed) onComplete();
    else {
      run.listeners.add(listener);
      run.completionListeners.add(onComplete);
    }
    return () => { run.listeners.delete(listener); run.completionListeners.delete(onComplete); };
  }

  /** Reattach to a live AgentPlan run from its latest complete Activity snapshot. */
  subscribeAgentPlanResume(
    id: string,
    listener: Listener,
    onComplete: () => void,
  ): () => void {
    const run = this.runs.get(id);
    if (run === undefined) throw new Error(`Unknown durable run: ${id}`);
    if (run.scenarioId !== "resumable-agent-plan" || run.activity === undefined) {
      throw new Error(`Run ${id} does not contain resumable AgentPlan Activity.`);
    }

    if (!run.completed) {
      run.listeners.add(listener);
      run.completionListeners.add(onComplete);
    }
    listener({
      type: "ACTIVITY_SNAPSHOT",
      threadId: run.threadId,
      runId: run.runId,
      messageId: AGENT_PLAN_MESSAGE_ID,
      activityType: AGENT_PLAN_ACTIVITY_TYPE,
      replace: true,
      content: structuredClone(run.activity),
    });
    if (run.completed) {
      listener({ type: "RUN_FINISHED", threadId: run.threadId, runId: run.runId });
      onComplete();
    }
    return () => { run.listeners.delete(listener); run.completionListeners.delete(onComplete); };
  }

  subscribeContinuation(id: string, listener: (text: string) => void): () => void {
    const run = this.runs.get(id);
    if (run === undefined) throw new Error(`Unknown durable run: ${id}`);
    const complete = () => listener(REST);
    if (run.completed) complete();
    else run.completionListeners.add(complete);
    return () => { run.completionListeners.delete(complete); };
  }
}

export const mockDurableRuns = new MockDurableRunStore();
