import { createContext, useContext, type ReactNode } from "react";

import type { UIPluginComponentProps } from "../../../../framework/contracts/ui-plugin";

type RenderSlot = UIPluginComponentProps["renderSlot"];

const ToolItemSlotBridgeContext = createContext<RenderSlot | null>(null);

export function ToolItemSlotBridgeProvider({
  children,
  renderSlot,
}: {
  children: ReactNode;
  renderSlot: RenderSlot;
}) {
  return (
    <ToolItemSlotBridgeContext.Provider value={renderSlot}>
      {children}
    </ToolItemSlotBridgeContext.Provider>
  );
}

export function useToolItemSlotBridge(): RenderSlot {
  const renderSlot = useOptionalToolItemSlotBridge();
  if (renderSlot === null) {
    throw new Error(
      "assistant-ui tool-item Slot adapter requires agent-tool-activity structural ownership",
    );
  }
  return renderSlot;
}

export function useOptionalToolItemSlotBridge(): RenderSlot | null {
  return useContext(ToolItemSlotBridgeContext);
}
