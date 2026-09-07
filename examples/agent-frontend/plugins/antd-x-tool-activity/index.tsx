import {
  CheckCircleOutlined,
  LoadingOutlined,
  StopOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Collapse, type CollapseProps } from "antd";
import type { ReactNode } from "react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {
  MessageRenderProvider,
  useToolActivityRenderContext,
  type ToolActivityStatus,
  type ToolPresentationItem,
} from "../../runtime/message-rendering";
import { readableJSON } from "../_shared/agent-ui-data";

import "./styles.css";

const statusLabels = {
  loading: "正在执行",
  success: "已完成",
  error: "失败",
  abort: "未完成",
} as const;

function statusIcon(status: ToolActivityStatus): ReactNode {
  if (status === "running") return <LoadingOutlined spin />;
  if (status === "completed") return <CheckCircleOutlined />;
  if (status === "error") return <WarningOutlined />;
  return <StopOutlined />;
}

function activitySummary({
  activeToolCallIds,
  items,
  status,
}: {
  activeToolCallIds: readonly string[];
  items: readonly ToolPresentationItem[];
  status: ToolActivityStatus;
}): string {
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

function LegacyToolItemRenderer({ item }: { item: ToolPresentationItem }) {
  const error = item.result?.error ?? item.execution?.error?.message;
  return (
    <details
      className="antd-x-tool-activity-item-fallback"
      data-tool-call-id={item.toolCall.id}
      data-tool-status={item.status}
    >
      <summary>
        <strong>{item.toolCall.function.name}</strong>
        <span>{statusLabels[item.status]}</span>
      </summary>
      <div>
        <span>Arguments</span>
        <pre>{readableJSON(item.toolCall.function.arguments)}</pre>
      </div>
      {error === undefined ? (
        <div>
          <span>Result</span>
          <pre>
            {item.result === undefined
              ? "工具没有返回结果"
              : readableJSON(item.result.content)}
          </pre>
        </div>
      ) : (
        <div>{error}</div>
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
        <LegacyToolItemRenderer item={item} />,
      )}
    </MessageRenderProvider>
  );
}

export function AntdXToolActivityPlugin({
  renderSlot,
}: UIPluginComponentProps) {
  const {
    activeToolCallIds,
    items,
    presentation,
    status,
    turnId,
  } = useToolActivityRenderContext();
  const toolItems = items.map((item) => (
    <ToolItem
      item={item}
      key={item.toolCall.id}
      renderSlot={renderSlot}
      turnId={turnId}
    />
  ));

  if (presentation === "flat") {
    return (
      <section
        aria-label="工具活动"
        className="antd-x-tool-activity-plugin antd-x-tool-activity-plugin--flat"
        data-agent-turn-id={turnId}
        data-tool-activity-status={status}
        data-tool-presentation="flat"
        data-ui-plugin="antd-x-tool-activity"
      >
        {toolItems}
      </section>
    );
  }

  const collapseItems: CollapseProps["items"] = [
    {
      key: "tools",
      forceRender: true,
      label: (
        <span className="antd-x-tool-activity-summary">
          {statusIcon(status)}
          <strong>{activitySummary({ activeToolCallIds, items, status })}</strong>
        </span>
      ),
      children: (
        <div className="antd-x-tool-activity-items">{toolItems}</div>
      ),
    },
  ];

  return (
    <section
      aria-label="工具活动"
      className={`antd-x-tool-activity-plugin antd-x-tool-activity-plugin--grouped antd-x-tool-activity-plugin--${status}`}
      data-agent-turn-id={turnId}
      data-tool-activity-status={status}
      data-tool-presentation="grouped"
      data-ui-plugin="antd-x-tool-activity"
    >
      <Collapse
        bordered={false}
        className="antd-x-tool-activity-collapse"
        ghost
        items={collapseItems}
        size="small"
      />
    </section>
  );
}
