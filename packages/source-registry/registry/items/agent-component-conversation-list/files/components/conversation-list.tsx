import type { ReactNode } from "react";

import { cx } from "../foundation/cx";
import styles from "./conversation-list.module.css";

export interface AgentConversationListProps {
  title?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function AgentConversationList({
  title,
  meta,
  action,
  children,
  ariaLabel = "会话",
  className,
}: AgentConversationListProps) {
  const hasHeader = title !== undefined || meta !== undefined || action !== undefined;

  return (
    <nav
      aria-label={ariaLabel}
      className={cx(styles.root, className)}
      data-slot="agent-conversation-list"
    >
      {hasHeader ? (
        <header className={styles.header} data-slot="agent-conversation-list-header">
          <div className={styles.heading}>
            {title === undefined ? null : (
              <div className={styles.title} data-slot="agent-conversation-list-title">
                {title}
              </div>
            )}
            {meta === undefined ? null : (
              <div className={styles.meta} data-slot="agent-conversation-list-meta">
                {meta}
              </div>
            )}
          </div>
          {action === undefined ? null : (
            <div className={styles.action} data-slot="agent-conversation-list-action">
              {action}
            </div>
          )}
        </header>
      ) : null}

      <div className={styles.content} data-slot="agent-conversation-list-content">
        {children}
      </div>
    </nav>
  );
}

export interface AgentConversationGroupProps {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AgentConversationGroup({
  label,
  children,
  className,
}: AgentConversationGroupProps) {
  return (
    <section
      className={cx(styles.group, className)}
      data-slot="agent-conversation-group"
    >
      {label === undefined ? null : (
        <div className={styles.groupLabel} data-slot="agent-conversation-group-label">
          {label}
        </div>
      )}
      <div className={styles.items} data-slot="agent-conversation-group-items">
        {children}
      </div>
    </section>
  );
}

export interface AgentConversationItemProps {
  title: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  ariaLabel?: string;
  className?: string;
}

export function AgentConversationItem({
  title,
  meta,
  leading,
  trailing,
  active = false,
  disabled = false,
  onSelect,
  ariaLabel,
  className,
}: AgentConversationItemProps) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-label={ariaLabel}
      className={cx(styles.item, className)}
      data-active={active || undefined}
      data-slot="agent-conversation-item"
      disabled={disabled}
      onClick={() => {
        if (!disabled) onSelect?.();
      }}
      type="button"
    >
      {leading === undefined ? null : (
        <span className={styles.leading} data-slot="agent-conversation-item-leading">
          {leading}
        </span>
      )}
      <span className={styles.itemBody}>
        <span className={styles.itemTitle} data-slot="agent-conversation-item-title">
          {title}
        </span>
        {meta === undefined ? null : (
          <span className={styles.itemMeta} data-slot="agent-conversation-item-meta">
            {meta}
          </span>
        )}
      </span>
      {trailing === undefined ? null : (
        <span className={styles.trailing} data-slot="agent-conversation-item-trailing">
          {trailing}
        </span>
      )}
    </button>
  );
}

export interface AgentConversationStateProps {
  kind: "loading" | "error" | "empty";
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function AgentConversationState({
  kind,
  children,
  action,
  className,
}: AgentConversationStateProps) {
  return (
    <div
      className={cx(styles.state, className)}
      data-kind={kind}
      data-slot="agent-conversation-state"
      role={kind === "error" ? "alert" : "status"}
    >
      {kind === "loading" ? (
        <span aria-hidden="true" className={styles.spinner} />
      ) : null}
      <div className={styles.stateContent}>{children}</div>
      {action === undefined ? null : (
        <div className={styles.stateAction}>{action}</div>
      )}
    </div>
  );
}
