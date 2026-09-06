import { Button } from "antd";
import { Conversations } from "@ant-design/x";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import { antdXConversationsPlugin } from "../plugins/antd-x-conversations/definition";
import { createPluginRegistry } from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const model = parseAppUIModel({
  version: "2",
  root: { type: "slot", id: "conversations-node", slotId: "conversations" },
  pluginInstances: {
    "conversations-main": {
      id: "conversations-main",
      pluginId: "antd-x-conversations",
      enabled: true,
      mount: { slotId: "conversations" },
    },
  },
});
const registry = createPluginRegistry([antdXConversationsPlugin]);

async function renderPlugin({
  startNewConversation = async () => undefined,
  status = "idle",
  state = {},
  updateInstanceProps = vi.fn(),
}: {
  startNewConversation?: () => Promise<void>;
  status?: "idle" | "running";
  state?: unknown;
  updateInstanceProps?: ReturnType<typeof vi.fn>;
} = {}): Promise<{
  renderer: ReactTestRenderer;
  updateInstanceProps: ReturnType<typeof vi.fn>;
}> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <PluginRuntimeFixture
        actions={{
          sendMessage: async () => undefined,
          resumeInterrupts: async () => undefined,
          startNewConversation,
          abortRun: () => undefined,
          updateInstanceProps,
        }}
        conversation={{ id: "current" }}
        executions={[]}
        interrupts={[]}
        messages={[]}
        model={model}
        registry={registry}
        run={{ status }}
        state={state}
      />,
    );
  });
  if (renderer === undefined) throw new Error("Renderer was not created");
  return { renderer, updateInstanceProps };
}

describe("AntdXConversationsPlugin", () => {
  it("delegates new-conversation creation to the shared runtime action", async () => {
    const startNewConversation = vi.fn(async () => undefined);
    const { renderer } = await renderPlugin({ startNewConversation });

    renderer.root.findByType(Button).props.onClick();
    await act(async () => Promise.resolve());

    expect(startNewConversation).toHaveBeenCalledOnce();
  });

  it("disables the action while the Agent Runtime is running", async () => {
    const { renderer } = await renderPlugin({ status: "running" });
    expect(renderer.root.findByType(Button).props.disabled).toBe(true);
  });

  it("shows history and keeps its selection working", async () => {
    const { renderer, updateInstanceProps } = await renderPlugin({
      state: { conversations: [{ key: "history", label: "历史会话" }] },
    });

    renderer.root.findByType(Conversations).props.onActiveChange("history");
    expect(updateInstanceProps).toHaveBeenCalledWith("conversations-main", {
      activeKey: "history",
    });
  });

  it("clears the history selection only after creating a new conversation", async () => {
    const { renderer, updateInstanceProps } = await renderPlugin();
    renderer.root.findByType(Button).props.onClick();
    expect(updateInstanceProps).not.toHaveBeenCalled();
    await act(async () => Promise.resolve());
    expect(updateInstanceProps).toHaveBeenCalledWith("conversations-main", {
      activeKey: null,
    });
  });

  it("retains the history selection when creation fails", async () => {
    const { renderer, updateInstanceProps } = await renderPlugin({
      startNewConversation: async () => {
        throw new Error("creation failed");
      },
    });
    renderer.root.findByType(Button).props.onClick();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(updateInstanceProps).not.toHaveBeenCalled();
  });
});
