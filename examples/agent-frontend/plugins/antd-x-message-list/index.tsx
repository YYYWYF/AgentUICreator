import { RobotOutlined, UserOutlined } from "@ant-design/icons";
import { Bubble, type BubbleItemType, type BubbleListProps } from "@ant-design/x";
import { Avatar, Empty } from "antd";

import type {
  AGUIMessage,
  UIPluginComponentProps,
} from "../../framework/contracts/ui-plugin";

import "./styles.css";

const roleLabels: Record<string, string> = {
  user: "你",
  assistant: "智能体",
  system: "系统",
  tool: "工具",
};

function messageText(message: AGUIMessage): string {
  if (!("content" in message)) {
    return "";
  }

  const content: unknown = message.content;

  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) => {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
      return [];
    })
    .join("\n");
}

function bubbleRole(role: string): string {
  if (role === "assistant") {
    return "ai";
  }
  if (role === "user") {
    return "user";
  }
  return "system";
}

function toBubbleItem(message: AGUIMessage): BubbleItemType {
  return {
    key: message.id,
    role: bubbleRole(message.role),
    content: messageText(message) || "暂不支持此消息内容",
    header: (
      <span className="antd-x-message-list-role">
        {message.role === "assistant" ? (
          <span className="antd-x-message-list-role-dot" />
        ) : null}
        {roleLabels[message.role] ?? message.role}
      </span>
    ),
  };
}

const bubbleRoles: BubbleListProps["role"] = {
  ai: {
    avatar: (
      <Avatar className="antd-x-message-list-avatar--agent" icon={<RobotOutlined />} />
    ),
    placement: "start",
    rootClassName: "antd-x-message-list-bubble--agent",
    shape: "corner",
    variant: "filled",
  },
  user: {
    avatar: (
      <Avatar
        className="antd-x-message-list-avatar--user"
        icon={<UserOutlined />}
      />
    ),
    placement: "end",
    rootClassName: "antd-x-message-list-bubble--user",
    shape: "corner",
    variant: "filled",
  },
  system: {
    placement: "start",
    rootClassName: "antd-x-message-list-bubble--system",
    variant: "borderless",
  },
};

export function AntdXMessageListPlugin({
  context,
}: UIPluginComponentProps) {
  const items = context.messages.map(toBubbleItem);
  const emptyText =
    typeof context.instance.props?.emptyText === "string"
      ? context.instance.props.emptyText
      : "开始一段新对话";

  if (context.run.status === "running") {
    items.push({
      key: `${context.instance.id}-running`,
      role: "ai",
      content: "智能体正在处理…",
      header: "智能体",
      loading: true,
      status: "loading",
    });
  }

  return (
    <section
      aria-label="智能体消息"
      className="antd-x-message-list-plugin"
      data-agent-run-status={context.run.status}
      data-ui-plugin="antd-x-message-list"
    >
      {items.length === 0 ? (
        <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Bubble.List autoScroll items={items} role={bubbleRoles} />
      )}
    </section>
  );
}
