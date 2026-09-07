import { BulbOutlined } from "@ant-design/icons";
import { Think } from "@ant-design/x";
import { Typography } from "antd";
import { useEffect, useRef, useState } from "react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginInstance } from "../../runtime/context";
import { useReasoningRenderContext } from "../../runtime/message-rendering";

import "./styles.css";

export function AntdXReasoningPlugin(_props: UIPluginComponentProps) {
  const { execution, message, running, turnId } = useReasoningRenderContext();
  const instance = usePluginInstance();
  const defaultExpanded = instance.props?.defaultExpanded !== false;
  const collapseOnComplete = instance.props?.collapseOnComplete !== false;
  const [expanded, setExpanded] = useState(running || defaultExpanded);
  const previousRunningRef = useRef(running);
  const status = execution?.status ?? (running ? "running" : "completed");

  useEffect(() => {
    const wasRunning = previousRunningRef.current;

    if (running) {
      setExpanded(true);
    } else if (
      wasRunning &&
      status === "completed" &&
      collapseOnComplete
    ) {
      setExpanded(false);
    }

    previousRunningRef.current = running;
  }, [collapseOnComplete, running, status]);

  const title =
    status === "running"
      ? "正在思考"
      : status === "interrupted"
        ? "思考已停止"
        : "思考过程";

  return (
    <Think
      aria-label={title}
      className="antd-x-reasoning-plugin"
      data-agent-message-id={message.id}
      data-reasoning-status={status}
      data-agent-turn-id={turnId}
      data-ui-plugin="antd-x-reasoning"
      expanded={expanded}
      icon={<BulbOutlined />}
      loading={running}
      onExpand={setExpanded}
      title={title}
    >
      <Typography.Paragraph>{message.content}</Typography.Paragraph>
    </Think>
  );
}
