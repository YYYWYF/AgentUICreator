import type { ReactNode } from "react";

import { cx } from "../foundation/cx";
import styles from "./message.module.css";

export type AgentMessageRole = "user" | "assistant" | "system";

export type AgentMessageStatus = "complete" | "streaming" | "error";

export interface AgentMessageProps {
  role: AgentMessageRole;
  children: ReactNode;
  status?: AgentMessageStatus;
  avatar?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function AgentMessage({
  role,
  children,
  status = "complete",
  avatar,
  header,
  footer,
  actions,
  ariaLabel,
  className,
}: AgentMessageProps) {
  const hasFooterRow = footer !== undefined || actions !== undefined;

  return (
    <article
      data-slot="agent-message"
      data-role={role}
      data-status={status}
      aria-label={ariaLabel}
      aria-busy={status === "streaming" ? true : undefined}
      className={cx(styles.root, className)}
    >
      {avatar === undefined ? null : (
        <div data-slot="agent-message-avatar" className={styles.avatar}>
          {avatar}
        </div>
      )}

      <div data-slot="agent-message-body" className={styles.body}>
        {header === undefined ? null : (
          <div data-slot="agent-message-header" className={styles.header}>
            {header}
          </div>
        )}

        <div data-slot="agent-message-content" className={styles.content}>
          {children}
        </div>

        {!hasFooterRow ? null : (
          <div data-slot="agent-message-footer-row" className={styles.footerRow}>
            {footer === undefined ? null : (
              <div data-slot="agent-message-footer" className={styles.footer}>
                {footer}
              </div>
            )}

            {actions === undefined ? null : (
              <div data-slot="agent-message-actions" className={styles.actions}>
                {actions}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
