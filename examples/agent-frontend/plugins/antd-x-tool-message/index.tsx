import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileOutlined,
  LoadingOutlined,
  StopOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Alert, Collapse, Typography, type CollapseProps } from "antd";
import type { ReactNode } from "react";

import type {
  AgentExecution,
  AgentMessage,
  UIPluginComponentProps,
} from "../../framework/contracts/ui-plugin";
import { usePluginInstance } from "../../runtime/context";
import { useToolRenderContext } from "../../runtime/message-rendering";
import { type InspectionStatus } from "../_shared/agent-ui-data";

import "./styles.css";

const statusLabels: Record<InspectionStatus, string> = {
  loading: "执行中",
  success: "已完成",
  error: "失败",
  abort: "未完成",
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

function parseToolValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function looksLikeFilePath(value: string): boolean {
  return value.includes("/") || /\.[a-z0-9]{1,8}$/iu.test(value);
}

function ScalarValue({ value }: { value: string | number | boolean | null }) {
  const text = value === null ? "null" : String(value);
  return (
    <span className="antd-x-tool-message-scalar">
      {typeof value === "string" && looksLikeFilePath(value) ? (
        <FileOutlined aria-hidden="true" />
      ) : null}
      <code>{text}</code>
    </span>
  );
}

function StructuredValue({ value }: { value: unknown }) {
  if (isScalar(value)) {
    return <ScalarValue value={value} />;
  }

  if (Array.isArray(value) && value.every(isScalar)) {
    return (
      <ul className="antd-x-tool-message-value-list">
        {value.map((item, index) => (
          <li key={`${String(item)}:${index}`}>
            <ScalarValue value={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (isRecord(value)) {
    return (
      <dl className="antd-x-tool-message-object">
        {Object.entries(value).map(([key, item]) => (
          <div className="antd-x-tool-message-field" key={key}>
            <dt>{key}</dt>
            <dd>
              <StructuredValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <pre className="antd-x-tool-message-raw-value">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function resultCount(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const arrays = Object.values(value).filter(Array.isArray);
  return arrays.length === 1 ? arrays[0]?.length : undefined;
}

function toolSummary(
  status: InspectionStatus,
  result: Extract<AgentMessage, { role: "tool" }> | undefined,
): string {
  if (status === "loading") return "工具调用 · 正在执行";
  if (status === "error") return "工具调用 · 执行失败";
  if (status === "abort") return "工具调用 · 未返回结果";
  if (result === undefined) return "工具调用 · 已完成";

  const count = resultCount(parseToolValue(result.content));
  return count === undefined
    ? "工具调用 · 已返回结果"
    : `工具调用 · ${count} 个结果`;
}

export function AntdXToolMessagePlugin(_props: UIPluginComponentProps) {
  const { execution, result, running, toolCall, turnId } =
    useToolRenderContext();
  const instance = usePluginInstance();
  const defaultExpanded = instance.props?.defaultExpanded === true;
  const showArguments = instance.props?.showArguments !== false;
  const showResult = instance.props?.showResult !== false;
  const status = inspectionStatus(result, execution, running);
  const summary = toolSummary(status, result);
  const details: CollapseProps["items"] = [
    {
      key: "details",
      forceRender: true,
      label: (
        <span className="antd-x-tool-message-identity">
          <span className="antd-x-tool-message-icon" aria-hidden="true">
            <ToolOutlined />
          </span>
          <span className="antd-x-tool-message-title">
            <strong>{toolCall.function.name}</strong>
            <small>{summary}</small>
          </span>
        </span>
      ),
      extra: (
        <span className="antd-x-tool-message-status">
          {statusIcon(status)}
          {statusLabels[status]}
        </span>
      ),
      children: (
        <div className="antd-x-tool-message-details">
          {showArguments ? (
            <section className="antd-x-tool-message-detail-section">
              <h4>输入</h4>
              <StructuredValue
                value={parseToolValue(toolCall.function.arguments)}
              />
            </section>
          ) : null}
          {result?.error !== undefined || execution?.error !== undefined ? (
            <Alert
              description={result?.error ?? execution?.error?.message}
              showIcon
              title="工具执行失败"
              type="error"
            />
          ) : !showResult ? null : result === undefined ? (
            <Typography.Text type="secondary">
              {status === "loading" ? "等待工具返回结果…" : "工具没有返回结果"}
            </Typography.Text>
          ) : (
            <section className="antd-x-tool-message-detail-section">
              <h4>输出</h4>
              <StructuredValue value={parseToolValue(result.content)} />
            </section>
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
      <Collapse
        bordered={false}
        defaultActiveKey={defaultExpanded ? ["details"] : []}
        expandIconPlacement="end"
        ghost
        items={details}
        rootClassName="antd-x-tool-message-collapse"
        size="small"
      />
    </section>
  );
}
