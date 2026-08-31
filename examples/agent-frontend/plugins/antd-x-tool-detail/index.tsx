import {
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { CodeHighlighter, Mermaid } from "@ant-design/x";
import { Alert, Empty, Select, Tag, Typography } from "antd";
import { useState, type ReactNode } from "react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import {
  asRecord,
  inspectToolCalls,
  readableJSON,
  type InspectionStatus,
  type ToolCallInspection,
} from "../_shared/agent-ui-data";

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

function statusIcon(status: InspectionStatus): ReactNode {
  if (status === "loading") return <LoadingOutlined spin />;
  if (status === "success") return <CheckCircleOutlined />;
  if (status === "error") return <CloseCircleOutlined />;
  return <StopOutlined />;
}

function ToolResult({ call }: { call: ToolCallInspection }) {
  const agentUI = asRecord(call.result?.metadata?.agentUI);
  const renderType = agentUI?.render;

  if (call.result === undefined) {
    return (
      <Empty
        description={
          call.status === "loading" ? "等待工具返回结果…" : "工具没有返回结果"
        }
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  if (call.result.error !== undefined) {
    return (
      <Alert
        description={call.result.error}
        message="工具执行失败"
        showIcon
        type="error"
      />
    );
  }

  if (renderType === "mermaid") {
    return (
      <Mermaid
        actions={{ enableCopy: true, enableDownload: false, enableZoom: true }}
        classNames={{ graph: "antd-x-tool-detail-mermaid-graph" }}
        config={{ flowchart: { useMaxWidth: false } }}
        header="Result"
        style={{ minWidth: 0, width: "100%", maxWidth: "100%" }}
        styles={{
          graph: {
            height: "auto",
            minHeight: "10rem",
            minWidth: 0,
            width: "100%",
            maxWidth: "100%",
            justifyContent: "flex-start",
          },
        }}
      >
        {call.result.content}
      </Mermaid>
    );
  }

  return (
    <CodeHighlighter header="Result" lang="json" prismLightMode={false}>
      {readableJSON(call.result.content)}
    </CodeHighlighter>
  );
}

export function AntdXToolDetailPlugin({
  context,
}: UIPluginComponentProps) {
  const conversation = context.services.get(AGENT_UI_CONVERSATION_SERVICE);
  const messages =
    conversation === undefined
      ? context.messages
      : context.messages.filter((message) =>
          conversation.includesMessage(message),
        );
  const calls = inspectToolCalls(messages, context.run);
  const requestedToolCallId =
    typeof context.instance.props?.toolCallId === "string"
      ? context.instance.props.toolCallId
      : undefined;
  const [selectedToolCallId, setSelectedToolCallId] = useState<
    string | undefined
  >(requestedToolCallId ?? calls.at(-1)?.id);
  const selectedCall =
    calls.find((call) => call.id === selectedToolCallId) ??
    calls.find((call) => call.id === requestedToolCallId) ??
    calls.at(-1);

  return (
    <section
      aria-label="工具调用详情"
      className="antd-x-tool-detail-plugin"
      data-agent-run-status={context.run.status}
      data-ui-plugin="antd-x-tool-detail"
    >
      <header className="antd-x-tool-detail-header">
        <span>
          <ApiOutlined />
          <strong>工具详情</strong>
        </span>
        <Tag variant="filled">{calls.length} calls</Tag>
      </header>

      <div className="antd-x-tool-detail-content">
        {selectedCall === undefined ? (
          <Empty
            description="当前会话暂无工具调用"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <>
            <Select
              aria-label="选择工具调用"
              onChange={setSelectedToolCallId}
              options={calls.map((call) => ({
                label: call.name,
                value: call.id,
              }))}
              value={selectedCall.id}
            />
            <div className="antd-x-tool-detail-summary">
              <div>
                <span className="antd-x-tool-detail-status-icon">
                  {statusIcon(selectedCall.status)}
                </span>
                <strong>{selectedCall.name}</strong>
              </div>
              <Tag color={statusColors[selectedCall.status]}>
                {statusLabels[selectedCall.status]}
              </Tag>
            </div>
            <Typography.Text code copyable>
              {selectedCall.id}
            </Typography.Text>
            <CodeHighlighter
              header="Arguments"
              lang="json"
              prismLightMode={false}
            >
              {readableJSON(selectedCall.argumentsText)}
            </CodeHighlighter>
            <ToolResult call={selectedCall} />
          </>
        )}
      </div>
    </section>
  );
}
