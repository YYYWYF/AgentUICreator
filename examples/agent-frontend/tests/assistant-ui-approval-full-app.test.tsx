// @vitest-environment jsdom

import {
  AbstractAgent,
  type BaseEvent,
  type RunAgentInput,
} from "@ag-ui/client";
import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import {
  useAgUiRuntime,
  type AgUiAssistantRuntime,
} from "@assistant-ui/react-ag-ui";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Observable } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import {
  approvalResumeScenario,
  runMockScenario,
} from "@agent-ui/mock-agent";
import { ConversationAdapter } from "../agent-ui/conversation/ConversationAdapter";
import { createConversationToolkit } from "../agent-ui/conversation/toolkit";

const assistantConfig = AuiConfig({
  tools: Tools({
    toolkit: createConversationToolkit({ mockAgentElements: true }) as never,
  }),
});

const mountedRoots: Root[] = [];

class ApprovalScenarioAgent extends AbstractAgent {
  readonly runInputs: RunAgentInput[] = [];

  constructor() {
    super({ threadId: "approval-thread" });
  }

  override run(input: RunAgentInput): Observable<BaseEvent> {
    this.runInputs.push(input);
    return new Observable<BaseEvent>((subscriber) => {
      let stopped = false;
      void (async () => {
        try {
          for await (const event of runMockScenario(
            input,
            approvalResumeScenario,
            { timingScale: 0 },
          )) {
            if (stopped) return;
            subscriber.next(event);
            await Promise.resolve();
          }
          if (!stopped) subscriber.complete();
        } catch (error) {
          if (!stopped) subscriber.error(error);
        }
      })();

      return () => {
        stopped = true;
      };
    });
  }
}

function renderConversationScopedSlot(
  slotName: string,
  scope: { value: unknown },
  fallback?: ReactNode,
) {
  if (slotName === "toolGroup" || slotName === "reasoningGroup") {
    return (scope.value as { children?: ReactNode }).children ?? null;
  }
  return fallback ?? null;
}

function RuntimeHarness({
  agent,
  onRuntime,
}: {
  agent: ApprovalScenarioAgent;
  onRuntime: (runtime: AgUiAssistantRuntime) => void;
}) {
  const runtime = useAgUiRuntime({ agent });
  onRuntime(runtime);
  return (
    <AssistantRuntimeProvider config={assistantConfig} runtime={runtime}>
      <ConversationAdapter renderScopedSlot={renderConversationScopedSlot} />
    </AssistantRuntimeProvider>
  );
}

async function flushReact(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function mountRuntime(agent: ApprovalScenarioAgent) {
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
    await flushReact();
  });
  if (runtime === undefined) throw new Error("assistant-ui runtime was not captured");
  return { container, runtime };
}

async function waitForResume(agent: ApprovalScenarioAgent): Promise<RunAgentInput> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const resumed = agent.runInputs[1];
    if (resumed !== undefined) return resumed;
    await act(async () => {
      await flushReact();
    });
  }
  throw new Error("Approval response did not start a resumed run");
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("assistant-ui AG-UI Tool Approval", () => {
  it.each([
    {
      button: "Allow",
      approved: true,
      result: "已获得许可，临时构建产物已清理。",
    },
    {
      button: "Deny",
      approved: false,
      result: "操作已取消，未删除任何文件。",
    },
  ] as const)("renders $button and resumes with approved=$approved", async ({
    button,
    approved,
    result,
  }) => {
    const agent = new ApprovalScenarioAgent();
    const { container, runtime } = await mountRuntime(agent);

    await act(async () => {
      await runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "请处理临时构建产物" }],
        startRun: true,
      });
      await flushReact();
    });

    expect(container.textContent).toContain("允许删除生成的临时构建产物吗？");
    expect(container.textContent).toContain("Allow");
    expect(container.textContent).toContain("Deny");

    const decisionButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.trim() === button);
    if (decisionButton === undefined) {
      throw new Error(`${button} approval button is missing`);
    }

    await act(async () => {
      decisionButton.click();
      await flushReact();
    });

    const resumed = await waitForResume(agent);
    expect(resumed.resume).toContainEqual(expect.objectContaining({
      interruptId: "approval-resume-1",
      status: "resolved",
      payload: { approved },
    }));
    expect(container.textContent).toContain(result);
  });
});
