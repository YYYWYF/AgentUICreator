import type {
  ToolActivityStatus,
  ToolPresentationItem,
} from "../../runtime/message-rendering";

export function createToolActivitySummary({
  activeToolCallIds,
  items,
  requiresActionToolCallIds,
  status,
}: {
  activeToolCallIds: readonly string[];
  items: readonly ToolPresentationItem[];
  requiresActionToolCallIds?: readonly string[];
  status: ToolActivityStatus;
}): string {
  const actionIds = requiresActionToolCallIds ?? [];
  if (status === "requires-action") {
    if (actionIds.length === 1) {
      const actionItem = items.find(
        (item) => item.toolCall.id === actionIds[0],
      );
      return actionItem === undefined
        ? "等待操作"
        : `等待确认：${actionItem.toolCall.function.name}`;
    }
    return `等待 ${actionIds.length || items.length} 个工具操作`;
  }
  if (status === "running") {
    if (activeToolCallIds.length > 1) {
      return `正在调用 ${activeToolCallIds.length} 个工具`;
    }
    const activeId = activeToolCallIds[0];
    const activeItem = items.find((item) => item.toolCall.id === activeId);
    return activeItem === undefined
      ? "正在调用工具"
      : `正在调用 ${activeItem.toolCall.function.name}`;
  }
  if (status === "completed") {
    return `使用了 ${items.length} 个工具`;
  }
  if (status === "error") {
    const failedCount = items.filter((item) => item.status === "error").length;
    return `${items.length} 个工具 · ${failedCount} 个失败`;
  }
  const interruptedCount = items.filter(
    (item) => item.status === "abort",
  ).length;
  return `${items.length} 个工具 · ${interruptedCount} 个未完成`;
}
