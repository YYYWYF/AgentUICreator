import { createContext, useContext, type ReactNode } from "react";
import { type ConversationThinkingIndicatorRenderScope, type ConversationUserEditComposerRenderScope, type ConversationTaskGroupRenderScope, toConversationMessagePartGroup, type ConversationAssistantResponseFooterRenderScope, type ConversationReasoningGroupRenderScope, type ConversationToolGroupRenderScope, type ConversationToolFallbackRenderScope, type ConversationToolCallProps } from "../../../plugin-api/index.js";
import { ConversationCanonicalUserEditComposer } from "../../../presentation.js";

import type { UIPluginComponentProps } from "../../../contracts/index.js";

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
  }, null);
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

export function ScopedUserEditComposer() {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  const fallback = <ConversationCanonicalUserEditComposer />;
  if (renderScopedSlot === null) return fallback;
  return renderScopedSlot("userEditComposer", {
    kind: "conversation.user-edit-composer",
    value: {} satisfies ConversationUserEditComposerRenderScope,
  }, fallback);
}

export function ScopedToolTimeline({ children }: { children?: ReactNode }) {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  if (renderScopedSlot === null) return children;
  return renderScopedSlot("toolTimeline", { kind: "conversation.tool-timeline", value: { children } }, children);
}

export function ScopedThinkingIndicator(value: ConversationThinkingIndicatorRenderScope) {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  if (renderScopedSlot === null) return null;
  return renderScopedSlot("thinkingIndicator", { kind: "conversation.thinking-indicator", value });
}

export function ScopedTransientMessages(value: { afterMessageId: string | null }) {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  if (renderScopedSlot === null) return null;
  return renderScopedSlot("transientMessages", { kind: "conversation.transient-messages", value });
}
