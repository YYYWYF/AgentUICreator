import { createContext, useContext, type ReactNode } from "react";
import {
  ConversationCanonicalReasoningGroup,
  ConversationCanonicalToolGroup,
  ConversationToolFallback,
  toConversationMessagePartGroup,
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
  const fallback = <ConversationCanonicalReasoningGroup group={group}>{children}</ConversationCanonicalReasoningGroup>;
  if (renderScopedSlot === null) return fallback;
  const value: ConversationReasoningGroupRenderScope = { group, children };
  return renderScopedSlot("reasoningGroup", { kind: "conversation.reasoning-group", value }, fallback);
}

export function ScopedToolGroup({ group: rawGroup, children }: { group: unknown; children?: ReactNode }) {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  const group = toConversationMessagePartGroup(rawGroup);
  const fallback = <ConversationCanonicalToolGroup group={group}>{children}</ConversationCanonicalToolGroup>;
  if (renderScopedSlot === null) return fallback;
  const value: ConversationToolGroupRenderScope = { group, children };
  return renderScopedSlot("toolGroup", { kind: "conversation.tool-group", value }, fallback);
}

export function ScopedToolFallback(tool: ConversationToolCallProps) {
  const renderScopedSlot = useContext(ScopedRendererBridgeContext);
  const fallback = <ConversationToolFallback {...tool} />;
  if (renderScopedSlot === null) return fallback;
  const value: ConversationToolFallbackRenderScope = { tool };
  return renderScopedSlot("toolFallback", { kind: "conversation.tool-fallback", value }, fallback);
}
