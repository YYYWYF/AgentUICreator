import { AgentToolActivity } from "../../agent-ui/components/tool-activity";
import type { ReactNode } from "react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {
  MessageRenderProvider,
  useToolActivityRenderContext,
  type ToolActivityStatus,
  type ToolPresentationItem,
} from "../../runtime/message-rendering";
import { readableJSON } from "../_shared/agent-ui-data";
import { useToolActivityDisclosure } from "./tool-activity-disclosure";
import { createToolActivitySummary } from "./tool-activity-presentation";

import "./styles.css";

const statusLabels = {
  loading: "正在执行",
  success: "已完成",
  error: "失败",
  abort: "未完成",
} as const;

function ToolItemFallbackRenderer({ item }: { item: ToolPresentationItem }) {
  const error = item.result?.error ?? item.execution?.error?.message;
  return (
    <details
      className="agent-tool-activity-item-fallback"
      data-slot="agent-tool-item-fallback"
      data-tool-call-id={item.toolCall.id}
      data-tool-status={item.status}
    >
      <summary data-slot="agent-tool-item-fallback-summary">
        <strong>{item.toolCall.function.name}</strong>
        <span>{statusLabels[item.status]}</span>
      </summary>
      <div data-slot="agent-tool-item-fallback-arguments">
        <span>Arguments</span>
        <pre>{readableJSON(item.toolCall.function.arguments)}</pre>
      </div>
      {error === undefined ? (
        <div data-slot="agent-tool-item-fallback-result">
          <span>Result</span>
          <pre>
            {item.result === undefined
              ? "工具没有返回结果"
              : readableJSON(item.result.content)}
          </pre>
        </div>
      ) : (
        <div data-slot="agent-tool-item-fallback-error">{error}</div>
      )}
    </details>
  );
}

function ToolItem({
  item,
  renderSlot,
  turnId,
}: {
  item: ToolPresentationItem;
  renderSlot: UIPluginComponentProps["renderSlot"];
  turnId: string;
}) {
  return (
    <MessageRenderProvider
      value={{
        kind: "tool",
        turnId,
        toolCall: item.toolCall,
        result: item.result,
        execution: item.execution,
        running: item.status === "loading",
      }}
    >
      {renderSlot(
        "conversation.message.tool-item",
        <ToolItemFallbackRenderer item={item} />,
      )}
    </MessageRenderProvider>
  );
}

function GroupedToolActivity({
  activityId,
  activeToolCallIds,
  items,
  status,
  children,
}: {
  activityId: string;
  activeToolCallIds: readonly string[];
  items: readonly ToolPresentationItem[];
  status: ToolActivityStatus;
  children: ReactNode;
}) {
  const disclosure = useToolActivityDisclosure({ activityId });
  const summary = createToolActivitySummary({
    activeToolCallIds,
    items,
    status,
  });

  return (
    <AgentToolActivity
      presentation="grouped"
      status={status}
      expanded={disclosure.expanded}
      onExpandedChange={disclosure.onExpandedChange}
      summary={summary}
      ariaLabel="工具活动"
    >
      {children}
    </AgentToolActivity>
  );
}

export function AgentToolActivityPlugin({
  renderSlot,
}: UIPluginComponentProps) {
  const {
    activeToolCallIds,
    items,
    presentation,
    status,
    turnId,
  } = useToolActivityRenderContext();
  const activityId = items[0]?.toolCall.id ?? turnId;
  const toolItems = items.map((item) => (
    <ToolItem
      item={item}
      key={item.toolCall.id}
      renderSlot={renderSlot}
      turnId={turnId}
    />
  ));

  return (
    <div
      data-agent-turn-id={turnId}
      data-tool-activity-status={status}
      data-tool-presentation={presentation}
      data-ui-plugin="agent-tool-activity"
    >
      {presentation === "flat" ? (
        <AgentToolActivity
          presentation="flat"
          status={status}
          ariaLabel="工具活动"
        >
          {toolItems}
        </AgentToolActivity>
      ) : (
        <GroupedToolActivity
          activityId={activityId}
          activeToolCallIds={activeToolCallIds}
          items={items}
          status={status}
        >
          {toolItems}
        </GroupedToolActivity>
      )}
    </div>
  );
}
