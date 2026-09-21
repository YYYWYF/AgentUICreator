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
  readonly events = new Subject<BaseEvent>();

  constructor() {
    super({ threadId: mockInput.threadId });
  }

  override run(_input: RunAgentInput): Observable<BaseEvent> {
    return this.events.asObservable();
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

describe("assistant-ui AG-UI Agent State projection", () => {
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
      firstDeltaIndex === undefined ||
      secondDeltaIndex === undefined
    ) {
      throw new Error("state showcase did not emit the expected state events");
    }

    let appendPromise!: Promise<void>;
    await act(async () => {
      appendPromise = runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "规划东京旅行" }],
        startRun: true,
      });
      await Promise.resolve();
    });

    await act(async () => {
      for (const event of events.slice(0, snapshotIndex + 1)) {
        agent.events.next(event);
      }
    });
    expect(runtime.thread.getState().state).toEqual({
      trip: {
        destination: "Tokyo",
        days: 5,
        status: "planning",
      },
    });

    await act(async () => {
      for (const event of events.slice(snapshotIndex + 1, firstDeltaIndex + 1)) {
        agent.events.next(event);
      }
    });
    expect(runtime.thread.getState().state).toEqual({
      trip: {
        destination: "Tokyo",
        days: 5,
        status: "researching",
        budget: 1200,
      },
    });

    await act(async () => {
      for (const event of events.slice(firstDeltaIndex + 1, secondDeltaIndex + 1)) {
        agent.events.next(event);
      }
    });
    expect(runtime.thread.getState().state).toEqual({
      trip: {
        destination: "Tokyo",
        days: 5,
        status: "ready",
        budget: 1200,
      },
    });

    await act(async () => {
      for (const event of events.slice(secondDeltaIndex + 1)) {
        agent.events.next(event);
      }
      agent.events.complete();
      await appendPromise;
    });
  });
});
