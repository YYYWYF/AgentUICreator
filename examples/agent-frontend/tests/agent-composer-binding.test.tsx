import { Suggestion } from "@ant-design/x";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { AgentComposer } from "../agent-ui/components/composer";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type {
  AgentExecution,
  AgentInterrupt,
  AgentRunState,
  AgentUserInput,
} from "../framework/contracts/ui-plugin";
import { antdXSenderPlugin } from "../plugins/antd-x-sender/definition";
import { createPluginRegistry } from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const model = parseAppUIModel({
  version: "2",
  root: { type: "slot", id: "sender-node", slotId: "sender" },
  pluginInstances: {
    sender: {
      id: "sender",
      pluginId: "antd-x-sender",
      enabled: true,
      mount: { slotId: "sender" },
    },
  },
});

interface RenderSenderOptions {
  run?: AgentRunState;
  executions?: AgentExecution[];
  interrupts?: AgentInterrupt[];
  sendMessage?: (input: string | AgentUserInput) => Promise<void>;
  abortRun?: () => void;
}

async function renderSender({
  run = { status: "idle" },
  executions = [],
  interrupts = [],
  sendMessage = async () => undefined,
  abortRun = () => undefined,
}: RenderSenderOptions = {}): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <PluginRuntimeFixture
        actions={{
          sendMessage,
          resumeInterrupts: async () => undefined,
          startNewConversation: async () => undefined,
          abortRun,
          updateInstanceProps: () => undefined,
        }}
        conversation={{ id: "live" }}
        executions={executions}
        interrupts={interrupts}
        messages={[]}
        model={model}
        registry={createPluginRegistry([antdXSenderPlugin])}
        run={run}
        state={{}}
      />,
    );
  });
  if (renderer === undefined) throw new Error("Renderer was not created");
  return renderer;
}

describe("AgentComposer runtime binding", () => {
  it("preserves the complete running-state aggregation", async () => {
    const pendingTool: AgentExecution = {
      type: "tool",
      id: "tool-1",
      producer: { type: "root" },
      name: "lookup",
      status: "awaiting-result",
      arguments: "{}",
    };
    const interrupt: AgentInterrupt = {
      id: "interrupt-1",
      producer: { type: "root" },
      reason: "approval",
    };
    const cases: RenderSenderOptions[] = [
      { run: { status: "running" } },
      { interrupts: [interrupt] },
      { executions: [pendingTool] },
    ];

    for (const options of cases) {
      const renderer = await renderSender(options);
      expect(renderer.root.findByType(AgentComposer).props.running).toBe(true);
      await act(async () => renderer.unmount());
    }

    const idleRenderer = await renderSender();
    expect(idleRenderer.root.findByType(AgentComposer).props.running).toBe(false);
    await act(async () => idleRenderer.unmount());
  });

  it("trims messages and clears the draft only after a successful send", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const renderer = await renderSender({ sendMessage });

    await act(async () => {
      renderer.root.findByType(AgentComposer).props.onValueChange("draft");
    });
    expect(renderer.root.findByType(AgentComposer).props.value).toBe("draft");

    await act(async () => {
      renderer.root.findByType(AgentComposer).props.onSubmit("  hello  ");
      await Promise.resolve();
    });
    expect(sendMessage).toHaveBeenCalledWith("hello");
    expect(renderer.root.findByType(AgentComposer).props.value).toBe("");
    await act(async () => renderer.unmount());
  });

  it("preserves the draft when sendMessage rejects", async () => {
    const sendMessage = vi.fn(async () => {
      throw new Error("send failed");
    });
    const renderer = await renderSender({ sendMessage });

    await act(async () => {
      renderer.root.findByType(AgentComposer).props.onValueChange("keep me");
    });
    await act(async () => {
      renderer.root.findByType(AgentComposer).props.onSubmit("keep me");
      await Promise.resolve();
    });

    expect(renderer.root.findByType(AgentComposer).props.value).toBe("keep me");
    await act(async () => renderer.unmount());
  });

  it("keeps slash-triggered suggestions and selection-driven draft updates", async () => {
    const renderer = await renderSender();
    await act(async () => {
      renderer.root.findByType(AgentComposer).props.onValueChange("/");
    });

    expect(renderer.root.findByType(AgentComposer).props.value).toBe("/");
    expect(renderer.root.findAll((node) => node.props.open === true).length)
      .toBeGreaterThan(0);

    await act(async () => {
      renderer.root.findByType(Suggestion).props.onSelect("请总结当前会话，并列出下一步。");
    });
    expect(renderer.root.findByType(AgentComposer).props.value)
      .toBe("请总结当前会话，并列出下一步。 ");
    await act(async () => renderer.unmount());
  });

  it("binds the running action to abortRun exactly once", async () => {
    const abortRun = vi.fn();
    const renderer = await renderSender({
      run: { status: "running" },
      abortRun,
    });

    renderer.root.findByType(AgentComposer).props.onStop();
    expect(abortRun).toHaveBeenCalledOnce();
    await act(async () => renderer.unmount());
  });

  it("projects Runtime errors through the plugin error banner", async () => {
    const renderer = await renderSender({
      run: {
        status: "error",
        error: { message: "Runtime send failed" },
      },
    });
    const alert = renderer.root.find(
      (node) => node.props["data-slot"] === "agent-composer-error",
    );
    expect(alert.props.role).toBe("alert");
    expect(alert.children).toContain("Runtime send failed");
    await act(async () => renderer.unmount());
  });
});
