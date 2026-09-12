import { createContext, useContext, type ReactNode } from "react";

import type { UIPluginComponentProps } from "../../../../framework/contracts/ui-plugin";

type RenderSlot = UIPluginComponentProps["renderSlot"];

const MessageSlotBridgeContext = createContext<RenderSlot | null>(null);

export function MessageSlotBridgeProvider({
  children,
  renderSlot,
}: {
  children: ReactNode;
  renderSlot: RenderSlot;
}) {
  return (
    <MessageSlotBridgeContext.Provider value={renderSlot}>
      {children}
    </MessageSlotBridgeContext.Provider>
  );
}

export function useMessageSlotBridge(): RenderSlot {
  const renderSlot = useOptionalMessageSlotBridge();
  if (renderSlot === null) {
    throw new Error(
      "assistant-ui message Slot adapters require agent-message-list structural ownership",
    );
  }
  return renderSlot;
}

export function useOptionalMessageSlotBridge(): RenderSlot | null {
  return useContext(MessageSlotBridgeContext);
}
