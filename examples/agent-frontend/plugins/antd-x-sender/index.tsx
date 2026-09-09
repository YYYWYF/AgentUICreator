import { useMemo, useRef } from "react";

import { AgentComposer } from "../../agent-ui/components/composer";
import {
  AgentComposerSuggestions,
  getAgentComposerSuggestionOptionId,
  type AgentComposerSuggestionItem,
} from "../../agent-ui/components/composer-suggestions";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginInstance } from "../../runtime/context";
import { useAgentComposerBinding } from "./use-agent-composer-binding";
import { useComposerSuggestions } from "./use-composer-suggestions";

import "./styles.css";

interface SuggestionItem {
  label: string;
  value: string;
  description?: string;
}

const defaultSuggestions: SuggestionItem[] = [
  {
    label: "总结当前会话",
    value: "请总结当前会话，并列出下一步。",
    description: "提炼目标、约束和下一步",
  },
  {
    label: "解释最近一次工具调用",
    value: "请解释最近一次工具调用的输入、输出和结论。",
    description: "查看输入、输出和结论",
  },
];

function readSuggestions(value: unknown): AgentComposerSuggestionItem[] {
  const configured = Array.isArray(value)
    ? value.flatMap((item) => {
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
      })
    : [];
  const resolved = configured.length > 0 ? configured : defaultSuggestions;

  return resolved.map((item, index) => ({
    id: `suggestion-${index}`,
    label: item.label,
    value: item.value,
    description: item.description,
  }));
}

export function AgentComposerPlugin(_props: UIPluginComponentProps) {
  const binding = useAgentComposerBinding();
  const instance = usePluginInstance();
  const anchorRef = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(
    () => readSuggestions(instance.props?.suggestions),
    [instance.props?.suggestions],
  );
  const controller = useComposerSuggestions({ binding, suggestions });
  const activeSuggestion = suggestions[controller.activeIndex];

  return (
    <section
      aria-label="消息输入"
      className="agent-composer-plugin"
      data-agent-run-status={binding.runStatus}
      data-conversation-mode={binding.historyMode ? "history" : "live"}
      data-ui-plugin="antd-x-sender"
    >
      {binding.error === undefined ? null : (
        <div
          role="alert"
          data-slot="agent-composer-error"
          className="agent-composer-plugin-error"
        >
          {binding.error.message}
        </div>
      )}
      <div ref={anchorRef} className="agent-composer-plugin-control">
        <AgentComposer
          value={binding.value}
          onValueChange={controller.onValueChange}
          onInputKeyDown={controller.onInputKeyDown}
          onSubmit={controller.onSubmit}
          running={binding.running}
          onStop={binding.onStop}
          disabled={binding.disabled}
          placeholder={binding.placeholder}
          inputProps={{
            "aria-autocomplete": "list",
            "aria-haspopup": "listbox",
            "aria-expanded": controller.open,
            "aria-controls": controller.open ? controller.listId : undefined,
            "aria-activedescendant":
              controller.open && activeSuggestion !== undefined
                ? getAgentComposerSuggestionOptionId(
                    controller.listId,
                    activeSuggestion.id,
                  )
                : undefined,
          }}
          labels={{
            input: "消息输入",
            send: "发送消息",
            stop: "停止生成",
            running: "正在生成",
          }}
        />
        <AgentComposerSuggestions
          open={controller.open}
          items={suggestions}
          activeIndex={controller.activeIndex}
          anchor={anchorRef}
          listId={controller.listId}
          ariaLabel="快捷建议"
          onOpenChange={controller.onOpenChange}
          onActiveIndexChange={controller.onActiveIndexChange}
          onSelect={controller.onSelect}
        />
      </div>
    </section>
  );
}
