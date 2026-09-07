import { createContext, useContext, type ReactNode } from "react";

import type {
  AgentExecution,
  AgentMessage,
  AgentToolCall,
} from "../../framework/contracts/ui-plugin";

export interface ReasoningRenderContext {
  kind: "reasoning";
  turnId?: string | undefined;
  message: Extract<AgentMessage, { role: "reasoning" }>;
  execution?: Extract<AgentExecution, { type: "reasoning" }> | undefined;
  running: boolean;
}

export interface ToolRenderContext {
  kind: "tool";
  turnId?: string | undefined;
  toolCall: AgentToolCall;
  result?: Extract<AgentMessage, { role: "tool" }> | undefined;
  execution?: Extract<AgentExecution, { type: "tool" }> | undefined;
  running: boolean;
}

export type MessageRenderContext =
  | ReasoningRenderContext
  | ToolRenderContext;

const MessageRenderReactContext =
  createContext<MessageRenderContext | null>(null);

export function MessageRenderProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: MessageRenderContext;
}) {
  return (
    <MessageRenderReactContext.Provider value={value}>
      {children}
    </MessageRenderReactContext.Provider>
  );
}

export function useMessageRenderContext(): MessageRenderContext {
  const context = useContext(MessageRenderReactContext);
  if (context === null) {
    throw new Error(
      "Message renderer plugins must be rendered inside MessageRenderProvider",
    );
  }
  return context;
}

export function useReasoningRenderContext(): ReasoningRenderContext {
  const context = useMessageRenderContext();
  if (context.kind !== "reasoning") {
    throw new Error(
      `Reasoning renderer received message render kind "${context.kind}"`,
    );
  }
  return context;
}

export function useToolRenderContext(): ToolRenderContext {
  const context = useMessageRenderContext();
  if (context.kind !== "tool") {
    throw new Error(`Tool renderer received message render kind "${context.kind}"`);
  }
  return context;
}
