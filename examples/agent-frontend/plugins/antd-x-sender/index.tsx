import { Suggestion } from "@ant-design/x";

import { AgentComposer } from "../../agent-ui/components/composer";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginInstance } from "../../runtime/context";
import { useAgentComposerBinding } from "./use-agent-composer-binding";

import "./styles.css";

interface SuggestionItem {
  label: string;
  value: string;
}

const defaultSuggestions: SuggestionItem[] = [
  {
    label: "总结当前会话",
    value: "请总结当前会话，并列出下一步。",
  },
  {
    label: "解释最近一次工具调用",
    value: "请解释最近一次工具调用的输入、输出和结论。",
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
  const binding = useAgentComposerBinding();
  const instance = usePluginInstance();
  const suggestions = readSuggestions(instance.props?.suggestions);

  return (
    <section
      aria-label="消息输入"
      className="antd-x-sender-plugin"
      data-agent-run-status={binding.runStatus}
      data-conversation-mode={binding.historyMode ? "history" : "live"}
      data-ui-plugin="antd-x-sender"
    >
      {binding.error === undefined ? null : (
        <div
          role="alert"
          data-slot="agent-composer-error"
          className="antd-x-sender-plugin-error"
        >
          {binding.error.message}
        </div>
      )}
      <Suggestion
        block
        items={suggestions}
        onSelect={(nextValue: string) => {
          if (!binding.historyMode) binding.onValueChange(`${nextValue} `);
        }}
        role="menu"
      >
        {({ onKeyDown, onTrigger, open }) => (
          <AgentComposer
            value={binding.value}
            onValueChange={(nextValue) => {
              binding.onValueChange(nextValue);
              if (nextValue === "/") {
                onTrigger();
              } else if (open) {
                onTrigger(false);
              }
            }}
            onInputKeyDown={onKeyDown}
            onSubmit={(message) => {
              onTrigger(false);
              binding.onSubmit(message);
            }}
            running={binding.running}
            onStop={binding.onStop}
            disabled={binding.disabled}
            placeholder={binding.placeholder}
            labels={{
              input: "消息输入",
              send: "发送消息",
              stop: "停止生成",
              running: "正在生成",
            }}
          />
        )}
      </Suggestion>
    </section>
  );
}
