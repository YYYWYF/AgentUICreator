import { describe, expect, it } from "vitest";

import type { ToolPresentationItem } from "../runtime/message-rendering";
import { createToolActivitySummary } from "../plugins/agent-tool-activity/tool-activity-presentation";

function item(
  id: string,
  name: string,
  status: ToolPresentationItem["status"],
): ToolPresentationItem {
  return {
    toolCall: {
      id,
      type: "function",
      function: { name, arguments: "{}" },
    },
    status,
  };
}

describe("createToolActivitySummary", () => {
  const items = [
    item("tool-a", "inspect", "success"),
    item("tool-b", "write", "error"),
    item("tool-c", "test", "abort"),
  ];

  it("names one active tool", () => {
    expect(createToolActivitySummary({
      activeToolCallIds: ["tool-a"],
      items,
      status: "running",
    })).toBe("正在调用 inspect");
  });

  it("counts multiple active tools", () => {
    expect(createToolActivitySummary({
      activeToolCallIds: ["tool-a", "tool-b"],
      items,
      status: "running",
    })).toBe("正在调用 2 个工具");
  });

  it("falls back when the active item is missing", () => {
    expect(createToolActivitySummary({
      activeToolCallIds: ["missing"],
      items,
      status: "running",
    })).toBe("正在调用工具");
  });

  it("summarizes completed activities", () => {
    expect(createToolActivitySummary({
      activeToolCallIds: [],
      items,
      status: "completed",
    })).toBe("使用了 3 个工具");
  });

  it("counts failed tools without deriving aggregate status", () => {
    expect(createToolActivitySummary({
      activeToolCallIds: [],
      items,
      status: "error",
    })).toBe("3 个工具 · 1 个失败");
  });

  it("counts interrupted tools separately from failures", () => {
    const interruptedItems = [
      item("tool-a", "inspect", "success"),
      item("tool-b", "write", "abort"),
      item("tool-c", "test", "abort"),
    ];
    expect(createToolActivitySummary({
      activeToolCallIds: [],
      items: interruptedItems,
      status: "interrupted",
    })).toBe("3 个工具 · 2 个未完成");
  });
});
