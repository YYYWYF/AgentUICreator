import type { RunAgentInput } from "@ag-ui/core";

const FIRST = "正在分析第一部分……";
const REST = "第二部分完成……任务完成";
const DURATION_MS = 9000;

type Event = Record<string, unknown>;
type Listener = (event: Event) => void;

interface DurableRun {
  threadId: string;
  runId: string;
  userText: string;
  runCount: number;
  completed: boolean;
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

  start(input: RunAgentInput): DurableRun {
    const previous = this.runs.get(input.threadId);
    const run: DurableRun = {
      threadId: input.threadId, runId: input.runId, userText: userText(input),
      runCount: (previous?.runCount ?? 0) + 1, completed: false,
      events: [], listeners: new Set(), completionListeners: new Set(),
    };
    this.runs.set(input.threadId, run);
    const emit = (event: Event) => {
      run.events.push(event);
      run.listeners.forEach(listener => listener(event));
    };
    emit({ type: "RUN_STARTED", threadId: run.threadId, runId: run.runId });
    emit({ type: "TEXT_MESSAGE_START", messageId: `${run.runId}-answer`, role: "assistant" });
    emit({ type: "TEXT_MESSAGE_CONTENT", messageId: `${run.runId}-answer`, delta: FIRST });
    setTimeout(() => {
      emit({ type: "TEXT_MESSAGE_CONTENT", messageId: `${run.runId}-answer`, delta: REST });
      emit({ type: "TEXT_MESSAGE_END", messageId: `${run.runId}-answer` });
      emit({ type: "RUN_FINISHED", threadId: run.threadId, runId: run.runId });
      run.completed = true;
      run.completionListeners.forEach(listener => listener());
      run.completionListeners.clear();
    }, DURATION_MS);
    return run;
  }

  list() {
    return [...this.runs.values()].map(run => ({
      id: run.threadId, title: "长任务：刷新后继续", runCount: run.runCount,
    }));
  }

  snapshot(id: string) {
    const run = this.runs.get(id);
    if (run === undefined) return undefined;
    return {
      threadId: id, runId: run.runId, runCount: run.runCount,
      userText: run.userText,
      assistantText: FIRST + (run.completed ? REST : ""),
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
