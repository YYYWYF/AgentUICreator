import type { ReactNode } from "react";

import { Spinner } from "../../agent-ui/primitives/spinner";

export type MessageAttachmentKind = "image" | "audio" | "video" | "file";

export interface MessageAttachmentItem {
  key: string;
  name: string;
  type: MessageAttachmentKind;
  src?: string;
}

export interface MessageSourceItem {
  key: string;
  title: string;
  url?: string;
  description?: string;
}

const attachmentKindLabels: Record<MessageAttachmentKind, string> = {
  image: "IMG",
  audio: "AUD",
  video: "VID",
  file: "FILE",
};

function safeAttachmentHref(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    return ["http:", "https:", "blob:"].includes(parsed.protocol)
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}

function safeSourceHref(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}

function AttachmentContent({
  item,
}: {
  item: MessageAttachmentItem;
}) {
  return (
    <>
      <span className="agent-message-list-attachment-type">
        {attachmentKindLabels[item.type]}
      </span>
      <span className="agent-message-list-attachment-name">{item.name}</span>
    </>
  );
}

export function MessageAttachmentList({
  items,
}: {
  items: readonly MessageAttachmentItem[];
}) {
  return (
    <ul
      className="agent-message-list-attachments"
      data-slot="agent-message-attachments"
    >
      {items.map((item) => {
        const href = safeAttachmentHref(item.src);
        let content: ReactNode = <AttachmentContent item={item} />;
        if (href !== undefined) {
          content = (
            <a href={href} target="_blank" rel="noreferrer">
              {content}
            </a>
          );
        }

        return (
          <li
            className="agent-message-list-attachment"
            data-slot="agent-message-attachment"
            data-type={item.type}
            key={item.key}
          >
            {content}
          </li>
        );
      })}
    </ul>
  );
}

export function MessageSourceList({
  items,
}: {
  items: readonly MessageSourceItem[];
}) {
  return (
    <section
      className="agent-message-list-sources"
      data-slot="agent-message-sources"
    >
      <header>{items.length} 个来源</header>
      <ol className="agent-message-list-source-list">
        {items.map((item) => {
          const href = safeSourceHref(item.url);
          return (
            <li className="agent-message-list-source" key={item.key}>
              {href === undefined ? (
                <span>{item.title}</span>
              ) : (
                <a href={href} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
              )}
              {item.description === undefined ? null : (
                <p className="agent-message-list-source-description">
                  {item.description}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function MessageEmptyState({ text }: { text: string }) {
  return (
    <div
      className="agent-message-list-empty"
      data-slot="agent-message-empty"
    >
      {text}
    </div>
  );
}

export function MessageLoadingState({ label }: { label: string }) {
  return (
    <div
      className="agent-message-list-state"
      data-slot="agent-message-loading"
      role="status"
    >
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function MessageErrorState({ message }: { message: string }) {
  return (
    <div
      className="agent-message-list-state agent-message-list-state--error"
      data-slot="agent-message-error"
      role="alert"
    >
      {message}
    </div>
  );
}
