import {
  BulbOutlined,
  CodeOutlined,
  CompassOutlined,
} from "@ant-design/icons";
import { Prompts, type PromptsItemType } from "@ant-design/x";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

import "./styles.css";

interface TemplatePrompt {
  key: string;
  text: string;
  description: string | undefined;
}

const defaultPrompts: TemplatePrompt[] = [
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

const promptIcons = [<BulbOutlined />, <CodeOutlined />, <CompassOutlined />];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readPrompts(value: unknown): TemplatePrompt[] {
  if (!Array.isArray(value)) {
    return defaultPrompts;
  }

  const prompts = value.flatMap((item, index) => {
    if (typeof item === "string" && item.trim().length > 0) {
      return [{ key: `prompt-${index}`, text: item, description: undefined }];
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
            : `prompt-${index}`,
        text: label,
        description:
          typeof description === "string" ? description : undefined,
      },
    ];
  });

  return prompts.length > 0 ? prompts : defaultPrompts;
}

export function AntdXPromptsPlugin({ context }: UIPluginComponentProps) {
  const prompts = readPrompts(context.instance.props?.items);
  const isRunning = context.run.status === "running";
  const title =
    typeof context.instance.props?.title === "string"
      ? context.instance.props.title
      : "你可以这样开始";
  const items: PromptsItemType[] = prompts.map((prompt, index) => ({
    key: prompt.key,
    label: prompt.text,
    disabled: isRunning,
    icon: promptIcons[index % promptIcons.length],
    ...(prompt.description === undefined
      ? {}
      : { description: prompt.description }),
  }));

  return (
    <section
      aria-label="快捷提示"
      className="antd-x-prompts-plugin"
      data-agent-run-status={context.run.status}
      data-ui-plugin="antd-x-prompts"
    >
      <Prompts
        fadeIn
        items={items}
        onItemClick={({ data }: { data: PromptsItemType }) => {
          const prompt = prompts.find((item) => item.key === data.key);
          if (prompt !== undefined && !isRunning) {
            void context.actions.sendMessage(prompt.text).catch(() => {
              // Shared run state exposes the runtime error to the sender plugin.
            });
          }
        }}
        title={title}
        wrap
      />
    </section>
  );
}
