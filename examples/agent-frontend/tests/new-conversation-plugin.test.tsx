import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { UIPluginContext } from "../framework/contracts/ui-plugin";
import { AntdXNewConversationPlugin } from "../plugins/antd-x-new-conversation";

function createContext(
  startNewConversation: UIPluginContext["actions"]["startNewConversation"],
  status: UIPluginContext["run"]["status"] = "idle",
): UIPluginContext {
  return {
    messages: [],
    state: {},
    run: { status, errorMessage: undefined },
    instance: {
      id: "new-conversation-main",
      pluginId: "antd-x-new-conversation",
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

function readButtonProps(context: UIPluginContext): {
  disabled?: boolean;
  onClick(): void;
} {
  const section = AntdXNewConversationPlugin({
    context,
    renderSlot: () => null,
  });
  const tooltip = (section.props as { children: ReactNode }).children;
  if (!isValidElement(tooltip)) {
    throw new Error("Expected the new-conversation tooltip");
  }

  const button = (tooltip.props as { children: ReactNode }).children;
  if (!isValidElement(button)) {
    throw new Error("Expected the new-conversation button");
  }

  return button.props as { disabled?: boolean; onClick(): void };
}

describe("AntdXNewConversationPlugin", () => {
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
});
