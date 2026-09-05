import { Children, isValidElement, type ReactNode } from "react";
import { Button } from "antd";
import { Conversations } from "@ant-design/x";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { UIPluginContext } from "../framework/contracts/ui-plugin";
import { AntdXConversationsPlugin } from "../plugins/antd-x-conversations";

function createContext(
  startNewConversation: UIPluginContext["actions"]["startNewConversation"],
  status: UIPluginContext["run"]["status"] = "idle",
): UIPluginContext {
  return {
    conversation: { id: "current" },
    messages: [],
    state: {},
    run: { status },
    instance: {
      id: "conversations-main",
      pluginId: "antd-x-conversations",
      enabled: true,
    },
    actions: {
      sendMessage: async () => undefined,
      startNewConversation,
      abortRun: () => undefined,
      updateInstanceProps: () => undefined,
    },
    services: { get: () => undefined },
  };
}

function findElementProps(
  node: ReactNode,
  type: unknown,
): Record<string, unknown> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === type) return child.props;
    const found = findElementProps(child.props.children, type);
    if (found) return found;
  }
  return undefined;
}

function readButtonProps(context: UIPluginContext): {
  disabled?: boolean;
  onClick(): void;
} {
  const element = AntdXConversationsPlugin({ context, renderSlot: () => null });
  const props = findElementProps(element, Button);
  if (!props) throw new Error("Expected the conversation creation button");
  return props as { disabled?: boolean; onClick(): void };
}

describe("AntdXConversationsPlugin", () => {
  it("delegates new-conversation creation to the shared runtime action", async () => {
    const startNewConversation = vi.fn(async () => undefined);
    const button = readButtonProps(createContext(startNewConversation));

    button.onClick();
    await Promise.resolve();

    expect(startNewConversation).toHaveBeenCalledOnce();
  });

  it("disables the action while the Agent Runtime is running", () => {
    const button = readButtonProps(
      createContext(async () => undefined, "running"),
    );

    expect(button.disabled).toBe(true);
  });

  it("shows creation alongside history and keeps history selection working", () => {
    const context = createContext(async () => undefined);
    context.state = { conversations: [{ key: "history", label: "历史会话" }] };
    context.actions.updateInstanceProps = vi.fn();
    const element = AntdXConversationsPlugin({ context, renderSlot: () => null });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("新建会话");
    expect(html).toContain("历史会话");
    const list = findElementProps(element, Conversations);
    (list?.onActiveChange as (key: string) => void)("history");
    expect(context.actions.updateInstanceProps).toHaveBeenCalledWith({ activeKey: "history" });
  });

  it("clears the history selection only after creating a new conversation", async () => {
    const context = createContext(async () => undefined);
    context.actions.updateInstanceProps = vi.fn();
    readButtonProps(context).onClick();
    expect(context.actions.updateInstanceProps).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(context.actions.updateInstanceProps).toHaveBeenCalledWith({ activeKey: null });
  });

  it("retains the history selection when creation fails", async () => {
    const context = createContext(async () => { throw new Error("creation failed"); });
    context.actions.updateInstanceProps = vi.fn();
    readButtonProps(context).onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(context.actions.updateInstanceProps).not.toHaveBeenCalled();
  });
});
