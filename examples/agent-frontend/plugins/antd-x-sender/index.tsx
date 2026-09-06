import { ApiOutlined, BulbOutlined, CodeOutlined } from "@ant-design/icons";
import { Sender, Suggestion } from "@ant-design/x";
import { Alert, Typography } from "antd";
import { useState } from "react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {
  useAgentExecutions,
  useAgentInterrupts,
  useAgentRun,
  usePluginActions,
  usePluginInstance,
} from "../../runtime/context";

import "./styles.css";

interface SuggestionItem {
  label: React.ReactNode;
  value: string;
  icon?: React.ReactNode;
}

const defaultSuggestions: SuggestionItem[] = [
  {
    label: "总结当前会话",
    value: "请总结当前会话，并列出下一步。",
    icon: <BulbOutlined />,
  },
  {
    label: "解释最近一次工具调用",
    value: "请解释最近一次工具调用的输入、输出和结论。",
    icon: <CodeOutlined />,
  },
];

function readSuggestions(value: unknown): SuggestionItem[] {
  if (!Array.isArray(value)) {
    return defaultSuggestions;
  }

  const items = value.flatMap((item) => {
    if (typeof item === "string" && item.trim().length > 0) {
      return [{ label: item, value: item }];
    }
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const record = item as Record<string, unknown>;
    return typeof record.label === "string" &&
      typeof record.value === "string"
      ? [{ label: record.label, value: record.value }]
      : [];
  });

  return items.length > 0 ? items : defaultSuggestions;
}

export function AntdXSenderPlugin(_props: UIPluginComponentProps) {
  const [value, setValue] = useState("");
  const executions = useAgentExecutions();
  const interrupts = useAgentInterrupts();
  const run = useAgentRun();
  const instance = usePluginInstance();
  const actions = usePluginActions();
  const hasPendingTool = executions.some(
    (execution) =>
      execution.type === "tool" &&
      execution.status === "awaiting-result",
  );
  const isRunning =
    run.status === "running" ||
    interrupts.length > 0 ||
    hasPendingTool;
  const placeholder =
    typeof instance.props?.placeholder === "string"
      ? instance.props.placeholder
      : "给智能体发送消息";
  const suggestions = readSuggestions(instance.props?.suggestions);

  const sendMessage = async (input: string): Promise<void> => {
    const message = input.trim();
    if (message.length === 0 || isRunning) {
      return;
    }

    try {
      await actions.sendMessage(message);
      setValue("");
    } catch {
      // The Runtime projects the error back through useAgentRun().
    }
  };

  return (
    <section
      aria-label="消息输入"
      className="antd-x-sender-plugin"
      data-agent-run-status={run.status}
      data-ui-plugin="antd-x-sender"
    >
      {run.error === undefined ? null : (
        <Alert
          closable
          message={run.error.message}
          showIcon
          type="error"
        />
      )}
      <Suggestion
        block
        items={suggestions}
        onSelect={(nextValue: string) => setValue(`${nextValue} `)}
        role="menu"
      >
        {({ onKeyDown, onTrigger, open }) => (
          <Sender
            autoSize={{ minRows: 1, maxRows: 5 }}
            footer={
              <span className="antd-x-sender-plugin-footer">
                <span className="antd-x-sender-plugin-channel">
                  <span /> AG-UI channel
                </span>
                <Typography.Text type="secondary">
                  输入 / 唤出指令 · Enter 发送
                </Typography.Text>
              </span>
            }
            loading={isRunning}
            onCancel={() => actions.abortRun()}
            onChange={(nextValue: string) => {
              setValue(nextValue);
              if (nextValue === "/") {
                onTrigger();
              } else if (open) {
                onTrigger(false);
              }
            }}
            onKeyDown={onKeyDown}
            onSubmit={(message: string) => {
              onTrigger(false);
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
        )}
      </Suggestion>
    </section>
  );
}
