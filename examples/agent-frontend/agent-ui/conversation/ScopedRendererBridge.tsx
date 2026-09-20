import { createContext, useContext, type ReactNode } from "react";
import {
  ConversationCanonicalAssistantMessage,
  toConversationMessagePartGroup,
  type ConversationAssistantMessageFooterRenderScope,
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

export function ScopedAssistantMessage() {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  const footer = renderScopedSlot === null
    ? null
    : renderScopedSlot("assistantMessageFooter", {
        kind: "conversation.assistant-message-footer",
        value: {} satisfies ConversationAssistantMessageFooterRenderScope,
      });

  return (
    <ConversationCanonicalAssistantMessage
      footer={footer}
      reasoningGroup={ScopedReasoningGroup}
      toolFallback={ScopedToolFallback}
      toolGroup={ScopedToolGroup}
    />
  );
}

export function ScopedToolGroup({ group: rawGroup, children }: { group: unknown; children?: ReactNode }) {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  const group = toConversationMessagePartGroup(rawGroup);
  if (renderScopedSlot === null) return null;
  const value: ConversationToolGroupRenderScope = { group, children };
  return renderScopedSlot("toolGroup", { kind: "conversation.tool-group", value });
}

export function ScopedToolFallback(tool: ConversationToolCallProps) {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  if (renderScopedSlot === null) return null;
  const value: ConversationToolFallbackRenderScope = { tool };
  return renderScopedSlot("toolFallback", { kind: "conversation.tool-fallback", value });
}
