import { ApiOutlined } from "@ant-design/icons";
import { Sender } from "@ant-design/x";
import { Alert, Typography } from "antd";
import { useState } from "react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

import "./styles.css";

export function AntdXSenderPlugin({ context }: UIPluginComponentProps) {
  const [value, setValue] = useState("");
  const isRunning = context.run.status === "running";
  const placeholder =
    typeof context.instance.props?.placeholder === "string"
      ? context.instance.props.placeholder
      : "给智能体发送消息";

  const sendMessage = async (input: string): Promise<void> => {
    const message = input.trim();
    if (message.length === 0 || isRunning) {
      return;
    }

    try {
      await context.actions.sendMessage(message);
      setValue("");
    } catch {
      // The runtime error is projected back through context.run.errorMessage.
    }
  };

  return (
    <section
      aria-label="消息输入"
      className="antd-x-sender-plugin"
      data-agent-run-status={context.run.status}
      data-ui-plugin="antd-x-sender"
    >
      {context.run.errorMessage === undefined ? null : (
        <Alert
          closable
          message={context.run.errorMessage}
          showIcon
          type="error"
        />
      )}
      <Sender
        autoSize={{ minRows: 1, maxRows: 5 }}
        footer={
          <span className="antd-x-sender-plugin-footer">
            <span className="antd-x-sender-plugin-channel">
              <span /> AG-UI channel
            </span>
            <Typography.Text type="secondary">
              Enter 发送 · Shift + Enter 换行
            </Typography.Text>
          </span>
        }
        loading={isRunning}
        onCancel={() => context.actions.abortRun()}
        onChange={setValue}
        onSubmit={(message: string) => {
          void sendMessage(message);
        }}
        placeholder={placeholder}
        prefix={
          <span className="antd-x-sender-plugin-prefix" aria-hidden="true">
            <ApiOutlined />
          </span>
        }
        submitType="enter"
        value={value}
      />
    </section>
  );
}
