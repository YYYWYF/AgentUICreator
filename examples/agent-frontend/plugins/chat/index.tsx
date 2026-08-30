import { useState, type FormEvent } from "react";

import type {
  AGUIMessage,
  UIPluginComponentProps,
} from "../../framework/contracts/ui-plugin";

import "./styles.css";

const roleLabels: Record<string, string> = {
  user: "用户",
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

  if (Array.isArray(content)) {
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

  return "";
}

export function ChatPlugin({ context }: UIPluginComponentProps) {
  const [input, setInput] = useState("");
  const isSending = context.run.status === "running";

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();

    if (message.length === 0 || isSending) {
      return;
    }

    try {
      await context.actions.sendMessage(message);
      setInput("");
    } catch {
      // The shared run state projects the runtime error back into this plugin.
    }
  };

  return (
    <section
      aria-label="智能体对话"
      className="chat-plugin"
      data-agent-run-status={context.run.status}
      data-ui-plugin="chat"
    >
      <header className="chat-plugin-header">
        <div>
          <span>智能体</span>
          <h2>对话</h2>
        </div>
        <strong>{context.messages.length}</strong>
      </header>

      <div className="chat-plugin-messages" aria-live="polite">
        {context.messages.length === 0 ? (
          <p className="chat-plugin-empty">还没有消息。</p>
        ) : (
          context.messages.map((message) => (
            <article
              className={`chat-plugin-message chat-plugin-message--${message.role}`}
              data-message-role={message.role}
              key={message.id}
            >
              <span>{roleLabels[message.role] ?? message.role}</span>
              <p>{messageText(message) || "暂不支持此消息内容"}</p>
            </article>
          ))
        )}
      </div>

      <form className="chat-plugin-form" onSubmit={submitMessage}>
        {context.run.errorMessage === undefined ? null : (
          <p className="chat-plugin-error" role="alert">
            {context.run.errorMessage}
          </p>
        )}
        <label htmlFor={`${context.instance.id}-input`}>消息</label>
        <div>
          <input
            id={`${context.instance.id}-input`}
            disabled={isSending}
            onChange={(event) => setInput(event.target.value)}
            placeholder="给智能体发送消息"
            value={input}
          />
          <button disabled={input.trim().length === 0 || isSending} type="submit">
            {isSending ? "发送中" : "发送"}
          </button>
        </div>
      </form>
    </section>
  );
}
