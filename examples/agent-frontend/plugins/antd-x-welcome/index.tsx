import { RobotOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Welcome } from "@ant-design/x";
import { Badge, Space, Tag } from "antd";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentRun, usePluginInstance } from "../../runtime/context";

import "./styles.css";

function readStringProp(
  props: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = props?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

const runStatus = {
  idle: { badge: "success", label: "已就绪" },
  running: { badge: "processing", label: "运行中" },
  "awaiting-input": { badge: "warning", label: "等待输入" },
  error: { badge: "error", label: "需要处理" },
} as const;

export function AntdXWelcomePlugin(_props: UIPluginComponentProps) {
  const run = useAgentRun();
  const instance = usePluginInstance();
  const title = readStringProp(
    instance.props,
    "title",
    "Agent Frontend",
  );
  const description = readStringProp(
    instance.props,
    "description",
    "一个由 AppUIModel 组合的 AG-UI 智能体前端。",
  );
  const status = runStatus[run.status];

  return (
    <section
      aria-label="智能体欢迎区"
      className="antd-x-welcome-plugin"
      data-agent-run-status={run.status}
      data-ui-plugin="antd-x-welcome"
    >
      <Welcome
        description={description}
        extra={
          <Space className="antd-x-welcome-plugin-meta" size="small" wrap>
            <Badge
              className="antd-x-welcome-plugin-status"
              status={status.badge}
              text={status.label}
            />
            <Tag className="antd-x-welcome-plugin-tag" variant="filled">
              AG-UI STREAM
            </Tag>
            <Tag className="antd-x-welcome-plugin-tag" variant="filled">
              PLUGIN COMPOSED
            </Tag>
          </Space>
        }
        icon={
          <span className="antd-x-welcome-plugin-core" aria-hidden="true">
            <span className="antd-x-welcome-plugin-core-ring" />
            <span className="antd-x-welcome-plugin-avatar">
              <RobotOutlined />
            </span>
          </span>
        }
        title={
          <span className="antd-x-welcome-plugin-heading">
            <span className="antd-x-welcome-plugin-eyebrow">
              <ThunderboltOutlined /> Neural workspace
            </span>
            <span>{title}</span>
          </span>
        }
        variant="borderless"
      />
    </section>
  );
}
