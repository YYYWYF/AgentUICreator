import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  StopOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Alert, Collapse, Tag, Typography, type CollapseProps } from "antd";
import type { ReactNode } from "react";

import type {
  AgentExecution,
  AgentMessage,
  UIPluginComponentProps,
} from "../../framework/contracts/ui-plugin";
import { usePluginInstance } from "../../runtime/context";
import { useToolRenderContext } from "../../runtime/message-rendering";
import { readableJSON, type InspectionStatus } from "../_shared/agent-ui-data";

import "./styles.css";

const statusLabels: Record<InspectionStatus, string> = {
  loading: "执行中",
  success: "已完成",
  error: "失败",
  abort: "未完成",
};

const statusColors: Record<InspectionStatus, string> = {
  loading: "processing",
  success: "success",
  error: "error",
  abort: "default",
};

function inspectionStatus(
  result: Extract<AgentMessage, { role: "tool" }> | undefined,
  execution: Extract<AgentExecution, { type: "tool" }> | undefined,
  running: boolean,
): InspectionStatus {
  switch (execution?.status) {
    case "preparing":
    case "awaiting-result":
      return "loading";
    case "completed":
      return "success";
    case "error":
      return "error";
    case "interrupted":
      return "abort";
  }
  if (result?.error !== undefined) return "error";
  if (result !== undefined) return "success";
  return running ? "loading" : "abort";
}

function statusIcon(status: InspectionStatus): ReactNode {
  if (status === "loading") return <LoadingOutlined spin />;
  if (status === "success") return <CheckCircleOutlined />;
  if (status === "error") return <CloseCircleOutlined />;
  return <StopOutlined />;
}

export function AntdXToolMessagePlugin(_props: UIPluginComponentProps) {
  const { execution, result, running, toolCall, turnId } =
    useToolRenderContext();
  const instance = usePluginInstance();
  const defaultExpanded = instance.props?.defaultExpanded === true;
  const showArguments = instance.props?.showArguments !== false;
  const showResult = instance.props?.showResult !== false;
  const status = inspectionStatus(result, execution, running);
  const details: CollapseProps["items"] = [
    {
      key: "details",
      forceRender: true,
      label: "参数与结果",
      children: (
        <div className="antd-x-tool-message-details">
          {showArguments ? (
            <div>
              <span>Arguments</span>
              <pre>{readableJSON(toolCall.function.arguments)}</pre>
            </div>
          ) : null}
          {result?.error !== undefined || execution?.error !== undefined ? (
            <Alert
              description={result?.error ?? execution?.error?.message}
              message="工具执行失败"
              showIcon
              type="error"
            />
          ) : !showResult ? null : result === undefined ? (
            <Typography.Text type="secondary">
              {status === "loading" ? "等待工具返回结果…" : "工具没有返回结果"}
            </Typography.Text>
          ) : (
            <div>
              <span>Result</span>
              <pre>{readableJSON(result.content)}</pre>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <section
      aria-label={`工具 ${toolCall.function.name}`}
      className={`antd-x-tool-message-plugin antd-x-tool-message-plugin--${status}`}
      data-agent-turn-id={turnId}
      data-tool-call-id={toolCall.id}
      data-tool-status={status}
      data-ui-plugin="antd-x-tool-message"
    >
      <header className="antd-x-tool-message-summary">
        <span>
          <ToolOutlined />
          <strong>{toolCall.function.name}</strong>
        </span>
        <Tag color={statusColors[status]} icon={statusIcon(status)}>
          {statusLabels[status]}
        </Tag>
      </header>
      <Collapse
        bordered={false}
        defaultActiveKey={defaultExpanded ? ["details"] : []}
        ghost
        items={details}
        size="small"
      />
    </section>
  );
}
