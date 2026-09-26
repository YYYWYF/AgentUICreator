import { createContext, useContext, type ReactNode } from "react";
import {
  type ConversationTaskGroupRenderScope,
  toConversationMessagePartGroup,
  type ConversationAssistantResponseFooterRenderScope,
  type ConversationReasoningGroupRenderScope,
  type ConversationToolGroupRenderScope,
  type ConversationToolFallbackRenderScope,
  type ConversationToolCallProps,
} from "@agent-ui/react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

type RenderScopedSlot = UIPluginComponentProps["renderScopedSlot"];
const ScopedRendererBridgeContext = createContext<RenderScopedSlot | null>(null);

export function ScopedRendererBridgeProvider({
  renderScopedSlot,
  children,
}: {
  renderScopedSlot: RenderScopedSlot;
  children: ReactNode;
}) {
  return (
    <ScopedRendererBridgeContext.Provider value={renderScopedSlot}>
      {children}
    </ScopedRendererBridgeContext.Provider>
  );
}

/** Stable Thread component identities preserve message and disclosure state. */
export function ScopedReasoningGroup({ group: rawGroup, children }: { group: unknown; children?: ReactNode }) {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  const group = toConversationMessagePartGroup(rawGroup);
  if (renderScopedSlot === null) return null;
  const value: ConversationReasoningGroupRenderScope = { group, children };
  return renderScopedSlot("reasoningGroup", { kind: "conversation.reasoning-group", value });
}

export function ScopedAssistantResponseFooter() {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  if (renderScopedSlot === null) return null;
  return renderScopedSlot("assistantResponseFooter", {
    kind: "conversation.assistant-response-footer",
    value: {} satisfies ConversationAssistantResponseFooterRenderScope,
  });
}

export function ScopedToolGroup({ group: rawGroup, children }: { group: unknown; children?: ReactNode }) {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  const group = toConversationMessagePartGroup(rawGroup);
  if (renderScopedSlot === null) return null;
  const value: ConversationToolGroupRenderScope = { group, children };
  return renderScopedSlot("toolGroup", { kind: "conversation.tool-group", value });
}

export function ScopedTaskGroup({ group, children }: { group: unknown; children?: ReactNode }) {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  const value: ConversationTaskGroupRenderScope = { group, children };
  if (renderScopedSlot === null) return children ?? null;
  return renderScopedSlot(
    "taskGroup",
    { kind: "conversation.task-group", value },
    children,
  );
}

export function ScopedToolFallback(tool: ConversationToolCallProps) {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  if (renderScopedSlot === null) return null;
  const fallbackValue: ConversationToolFallbackRenderScope = { tool };
  return renderScopedSlot("toolFallback", {
    kind: "conversation.tool-fallback",
    value: fallbackValue,
  });
}
