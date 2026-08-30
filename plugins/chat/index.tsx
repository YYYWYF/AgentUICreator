import { useState, type FormEvent } from "react";

import type {
  AGUIMessage,
  UIPluginComponentProps,
} from "../../framework/contracts/ui-plugin";

import "./styles.css";

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
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string>();

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();

    if (message.length === 0 || isSending) {
      return;
    }

    setIsSending(true);
    setSendError(undefined);
    try {
      await context.actions.sendMessage(message);
      setInput("");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section
      aria-label="Agent conversation"
      className="chat-plugin"
      data-ui-plugin="chat"
    >
      <header className="chat-plugin-header">
        <div>
          <span>Agent</span>
          <h2>Conversation</h2>
        </div>
        <strong>{context.messages.length}</strong>
      </header>

      <div className="chat-plugin-messages" aria-live="polite">
        {context.messages.length === 0 ? (
          <p className="chat-plugin-empty">No messages yet.</p>
        ) : (
          context.messages.map((message) => (
            <article
              className={`chat-plugin-message chat-plugin-message--${message.role}`}
              data-message-role={message.role}
              key={message.id}
            >
              <span>{message.role}</span>
              <p>{messageText(message) || "Unsupported message content"}</p>
            </article>
          ))
        )}
      </div>

      <form className="chat-plugin-form" onSubmit={submitMessage}>
        {sendError === undefined ? null : (
          <p className="chat-plugin-error" role="alert">
            {sendError}
          </p>
        )}
        <label htmlFor={`${context.instance.id}-input`}>Message</label>
        <div>
          <input
            id={`${context.instance.id}-input`}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Message the agent"
            value={input}
          />
          <button disabled={input.trim().length === 0 || isSending} type="submit">
            {isSending ? "Sending" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
