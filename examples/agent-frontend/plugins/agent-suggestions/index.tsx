import {
  AgentSuggestion,
  AgentSuggestions,
} from "../../agent-ui/components/suggestions";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {
  useAgentInterrupts,
  useAgentRun,
  usePluginActions,
  usePluginInstance,
} from "../../runtime/context";

import "./styles.css";

interface ThreadSuggestion {
  key: string;
  text: string;
  description: string | undefined;
}

const defaultSuggestions: ThreadSuggestion[] = [
  {
    key: "summarize",
    text: "总结当前上下文",
    description: "提炼目标、约束与下一步",
  },
  {
    key: "explain",
    text: "解释当前界面结构",
    description: "说明布局和插件的关系",
  },
  {
    key: "next",
    text: "建议下一步",
    description: "给出一个可执行的动作",
  },
];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readSuggestions(value: unknown): ThreadSuggestion[] {
  if (!Array.isArray(value)) {
    return defaultSuggestions;
  }

  const suggestions = value.flatMap((item, index) => {
    if (typeof item === "string" && item.trim().length > 0) {
      return [{ key: `suggestion-${index}`, text: item, description: undefined }];
    }

    const record = asRecord(item);
    const label = record?.label;
    if (typeof label !== "string" || label.trim().length === 0) {
      return [];
    }

    const key = record?.key;
    const description = record?.description;
    return [
      {
        key:
          typeof key === "string" && key.trim().length > 0
            ? key
            : `suggestion-${index}`,
        text: label,
        description:
          typeof description === "string" ? description : undefined,
      },
    ];
  });

  return suggestions.length > 0 ? suggestions : defaultSuggestions;
}

export function AgentSuggestionsPlugin(_props: UIPluginComponentProps) {
  const run = useAgentRun();
  const interrupts = useAgentInterrupts();
  const instance = usePluginInstance();
  const actions = usePluginActions();
  const suggestions = readSuggestions(instance.props?.items);
  const title = instance.props?.title;
  const disabled = run.status === "running" || interrupts.length > 0;

  return (
    <div
      className="agent-suggestions-plugin"
      data-agent-run-status={run.status}
      data-ui-plugin="agent-suggestions"
    >
      <AgentSuggestions
        {...(typeof title === "string" && title.trim().length > 0
          ? { title }
          : {})}
      >
        {suggestions.map((suggestion) => (
          <AgentSuggestion
            key={suggestion.key}
            description={suggestion.description}
            disabled={disabled}
            onSelect={() => {
              if (disabled) return;
              void actions.sendMessage(suggestion.text).catch(() => {
                // Shared run state exposes the runtime error to the caller.
              });
            }}
            title={suggestion.text}
          />
        ))}
      </AgentSuggestions>
    </div>
  );
}
