// @vitest-environment jsdom

import {
  AbstractAgent,
  type BaseEvent,
  type RunAgentInput,
} from "@ag-ui/client";
import { EventType } from "@ag-ui/core";
import { AssistantRuntimeProvider, AuiConfig } from "@assistant-ui/react";
import {
  useAgUiRuntime,
  type AgUiAssistantRuntime,
} from "@assistant-ui/react-ag-ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Observable, Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import {
  agentStateSyncScenario,
  runMockScenario,
} from "@agent-ui/mock-agent";

const mockInput: Parameters<typeof runMockScenario>[0] = {
  threadId: "state-thread",
  runId: "state-run",
  state: {},
  messages: [],
  tools: [],
  context: [],
  forwardedProps: {},
};

const mountedRoots: Root[] = [];

class ScenarioEventAgent extends AbstractAgent {
  readonly runInputs: RunAgentInput[] = [];
  readonly runEvents: Subject<BaseEvent>[] = [];

  constructor() {
    super({ threadId: mockInput.threadId });
  }

  override run(input: RunAgentInput): Observable<BaseEvent> {
    this.runInputs.push(input);
    const events = new Subject<BaseEvent>();
    this.runEvents.push(events);
    return events.asObservable();
  }
}

function RuntimeHarness({
  agent,
  onRuntime,
}: {
  agent: ScenarioEventAgent;
  onRuntime: (runtime: AgUiAssistantRuntime) => void;
}) {
  const runtime = useAgUiRuntime({ agent });
  onRuntime(runtime);
  return (
    <AssistantRuntimeProvider config={AuiConfig({})} runtime={runtime}>
      <div />
    </AssistantRuntimeProvider>
  );
}

async function collectScenarioEvents(): Promise<BaseEvent[]> {
  const events: BaseEvent[] = [];
  for await (const event of runMockScenario(
    mockInput,
    agentStateSyncScenario,
    { timingScale: 0 },
  )) {
    events.push(event);
  }
  return events;
}

async function mountRuntime(agent: ScenarioEventAgent) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  let runtime: AgUiAssistantRuntime | undefined;
  await act(async () => {
    root.render(
      <RuntimeHarness
        agent={agent}
        onRuntime={(nextRuntime) => {
          runtime = nextRuntime;
        }}
      />,
    );
  });
  if (runtime === undefined) throw new Error("assistant-ui runtime was not captured");
  return runtime;
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("assistant-ui AG-UI State → Job Progress projection", () => {
  it("applies STATE_SNAPSHOT and STATE_DELTA through the upstream runtime", async () => {
    const agent = new ScenarioEventAgent();
    const runtime = await mountRuntime(agent);
    const events = await collectScenarioEvents();
    const snapshotIndex = events.findIndex(
      ({ type }) => type === EventType.STATE_SNAPSHOT,
    );
    const deltaIndexes = events.flatMap((event, index) =>
      event.type === EventType.STATE_DELTA ? [index] : [],
    );
    const firstDeltaIndex = deltaIndexes[0];
    const secondDeltaIndex = deltaIndexes[1];
    if (
      snapshotIndex < 0 ||
      deltaIndexes.length !== 5 ||
      firstDeltaIndex === undefined ||
      secondDeltaIndex === undefined
    ) {
      throw new Error("state showcase did not emit the expected state events");
    }

    let appendPromise!: Promise<void>;
    await act(async () => {
      appendPromise = runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "验证当前修改能否通过 CI" }],
        startRun: true,
      });
      await Promise.resolve();
    });
    const firstRunEvents = agent.runEvents[0];
    if (firstRunEvents === undefined) {
      throw new Error("assistant-ui did not start the first run");
    }

    await act(async () => {
      for (const event of events.slice(0, snapshotIndex + 1)) {
        firstRunEvents.next(event);
      }
    });
    expect(runtime.thread.getState().state).toEqual({
      jobProgress: {
        id: "ci-verification",
        title: "Verify the current change on CI",
        stages: [
          { name: "clone", weight: 1 },
          { name: "install", weight: 3 },
          { name: "build", weight: 3 },
          { name: "test", weight: 3 },
        ],
        stageIndex: 0,
        stageProgress: 0.1,
        eta: "about 4 min",
      },
    });

    await act(async () => {
      for (const event of events.slice(snapshotIndex + 1, firstDeltaIndex + 1)) {
        firstRunEvents.next(event);
      }
    });
    expect(runtime.thread.getState().state).toEqual({
      jobProgress: {
        id: "ci-verification",
        title: "Verify the current change on CI",
        stages: [
          { name: "clone", weight: 1 },
          { name: "install", weight: 3 },
          { name: "build", weight: 3 },
          { name: "test", weight: 3 },
        ],
        stageIndex: 0,
        stageProgress: 0.7,
        eta: "about 3 min",
      },
    });

    await act(async () => {
      for (const event of events.slice(firstDeltaIndex + 1, secondDeltaIndex + 1)) {
        firstRunEvents.next(event);
      }
    });
    expect(runtime.thread.getState().state).toEqual({
      jobProgress: {
        id: "ci-verification",
        title: "Verify the current change on CI",
        stages: [
          { name: "clone", weight: 1 },
          { name: "install", weight: 3 },
          { name: "build", weight: 3 },
          { name: "test", weight: 3 },
        ],
        stageIndex: 1,
        stageProgress: 0.3,
        eta: "about 3 min",
      },
    });

    await act(async () => {
      for (const event of events.slice(secondDeltaIndex + 1, deltaIndexes[2]! + 1)) {
        firstRunEvents.next(event);
      }
    });
    expect(runtime.thread.getState().state).toMatchObject({
      jobProgress: {
        stageIndex: 2,
        stageProgress: 0.55,
        eta: "about 2 min",
      },
    });

    await act(async () => {
      for (const event of events.slice(deltaIndexes[2]! + 1, deltaIndexes[3]! + 1)) {
        firstRunEvents.next(event);
      }
    });
    expect(runtime.thread.getState().state).toMatchObject({
      jobProgress: {
        stageIndex: 3,
        stageProgress: 0.75,
        eta: "less than 1 min",
      },
    });

    await act(async () => {
      for (const event of events.slice(deltaIndexes[3]! + 1, deltaIndexes[4]! + 1)) {
        firstRunEvents.next(event);
      }
    });

    await act(async () => {
      for (const event of events.slice(deltaIndexes[4]! + 1)) {
        firstRunEvents.next(event);
      }
      firstRunEvents.complete();
      await appendPromise;
    });

    const finalState = {
      jobProgress: {
        id: "ci-verification",
        title: "Verify the current change on CI",
        stages: [
          { name: "clone", weight: 1 },
          { name: "install", weight: 3 },
          { name: "build", weight: 3 },
          { name: "test", weight: 3 },
        ],
        stageIndex: 4,
        stageProgress: 0,
        eta: "less than 1 min",
      },
    };
    expect(runtime.thread.getState().state).toEqual(finalState);

    let secondAppendPromise!: Promise<void>;
    await act(async () => {
      secondAppendPromise = runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "继续检查 CI 验证结果" }],
        startRun: true,
      });
      await Promise.resolve();
    });

    expect(agent.runInputs).toHaveLength(2);
    expect(agent.runInputs[1]?.state).toEqual(finalState);

    const secondRunInput = agent.runInputs[1];
    const secondRunEvents = agent.runEvents[1];
    if (secondRunInput === undefined || secondRunEvents === undefined) {
      throw new Error("assistant-ui did not start the second run");
    }
    await act(async () => {
      secondRunEvents.next({
        type: EventType.RUN_STARTED,
        threadId: secondRunInput.threadId,
        runId: secondRunInput.runId,
      });
      secondRunEvents.next({
        type: EventType.RUN_FINISHED,
        threadId: secondRunInput.threadId,
        runId: secondRunInput.runId,
        outcome: { type: "success" },
      });
      secondRunEvents.complete();
      await secondAppendPromise;
    });
  });
});
