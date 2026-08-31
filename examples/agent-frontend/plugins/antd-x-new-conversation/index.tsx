import { PlusOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

import "./styles.css";

export function AntdXNewConversationPlugin({
  context,
}: UIPluginComponentProps) {
  const isRunning = context.run.status === "running";

  return (
    <section
      className="antd-x-new-conversation-plugin"
      data-agent-run-status={context.run.status}
      data-ui-plugin="antd-x-new-conversation"
    >
      <Tooltip
        title={
          isRunning ? "请等待当前运行结束后再新建会话" : "清空上下文并新建会话"
        }
      >
        <Button
          aria-label="新建会话"
          className="antd-x-new-conversation-plugin-button"
          disabled={isRunning}
          icon={<PlusOutlined />}
          loading={isRunning}
          onClick={() => {
            void context.actions.startNewConversation().catch(() => undefined);
          }}
        >
          新建会话
        </Button>
      </Tooltip>
    </section>
  );
}
