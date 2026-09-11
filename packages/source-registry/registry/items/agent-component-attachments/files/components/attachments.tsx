import type { ReactNode } from "react";

import { cx } from "../foundation/cx";
import styles from "./attachments.module.css";

export type AgentAttachmentKind = "image" | "audio" | "video" | "file";

export interface AgentAttachmentsProps {
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export interface AgentAttachmentProps {
  name: ReactNode;
  kind: AgentAttachmentKind;
  href?: string;
  description?: ReactNode;
  preview?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export function AgentAttachments({
  children,
  ariaLabel,
  className,
}: AgentAttachmentsProps) {
  return (
    <div
      data-slot="agent-attachments"
      aria-label={ariaLabel}
      className={cx(styles.root, className)}
    >
      {children}
    </div>
  );
}

export function AgentAttachment({
  name,
  kind,
  href,
  description,
  preview,
  leading,
  trailing,
  className,
}: AgentAttachmentProps) {
  const content = (
    <>
      {preview === undefined ? null : (
        <span data-slot="agent-attachment-preview" className={styles.preview}>
          {preview}
        </span>
      )}
      <span data-slot="agent-attachment-leading" className={styles.leading}>
        {leading ?? kind.toUpperCase().slice(0, kind === "file" ? 4 : 3)}
      </span>
      <span data-slot="agent-attachment-content" className={styles.content}>
        <span data-slot="agent-attachment-name" className={styles.name}>
          {name}
        </span>
        {description === undefined ? null : (
          <span
            data-slot="agent-attachment-description"
            className={styles.description}
          >
            {description}
          </span>
        )}
      </span>
      {trailing === undefined ? null : (
        <span data-slot="agent-attachment-trailing" className={styles.trailing}>
          {trailing}
        </span>
      )}
    </>
  );

  if (href !== undefined) {
    return (
      <a
        data-slot="agent-attachment"
        data-kind={kind}
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cx(styles.item, className)}
      >
        {content}
      </a>
    );
  }

  return (
    <div
      data-slot="agent-attachment"
      data-kind={kind}
      className={cx(styles.item, className)}
    >
      {content}
    </div>
  );
}
