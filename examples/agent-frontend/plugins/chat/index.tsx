import { useState, type FormEvent } from "react";

import type {
  AgentMessage,
  UIPluginComponentProps,
} from "../../framework/contracts/ui-plugin";
import {
  useAgentInterrupts,
  useAgentMessages,
  useAgentRun,
  usePluginActions,
  usePluginInstance,
} from "../../runtime/context";

import "./styles.css";

const roleLabels: Record<string, string> = {
  user: "用户",
  assistant: "智能体",
  system: "系统",
  tool: "工具",
};

function messageText(message: AgentMessage): string {
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

export function ChatPlugin(_props: UIPluginComponentProps) {
  const [input, setInput] = useState("");
  const messages = useAgentMessages();
  const run = useAgentRun();
  const interrupts = useAgentInterrupts();
  const actions = usePluginActions();
  const instance = usePluginInstance();
  const isSending = run.status === "running" || interrupts.length > 0;

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();

    if (message.length === 0 || isSending) {
      return;
    }

    try {
      await actions.sendMessage(message);
      setInput("");
    } catch {
      // The shared run state projects the runtime error back into this plugin.
    }
  };

  return (
    <section
      aria-label="智能体对话"
      className="chat-plugin"
      data-agent-run-status={run.status}
      data-ui-plugin="chat"
    >
      <header className="chat-plugin-header">
        <div>
          <span>智能体</span>
          <h2>对话</h2>
        </div>
        <strong>{messages.length}</strong>
      </header>

      <div className="chat-plugin-messages" aria-live="polite">
        {messages.length === 0 ? (
          <p className="chat-plugin-empty">还没有消息。</p>
        ) : (
          messages.map((message) => (
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
        {run.error === undefined ? null : (
          <p className="chat-plugin-error" role="alert">
            {run.error.message}
          </p>
        )}
        <label htmlFor={`${instance.id}-input`}>消息</label>
        <div>
          <input
            id={`${instance.id}-input`}
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
