import type { ReactNode } from "react";

import { cx } from "../foundation/cx";
import styles from "./sources.module.css";

export interface AgentSourcesProps {
  children: ReactNode;
  title?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export interface AgentSourceProps {
  title: ReactNode;
  href?: string;
  description?: ReactNode;
  index?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export function AgentSources({
  children,
  title,
  ariaLabel,
  className,
}: AgentSourcesProps) {
  return (
    <section
      data-slot="agent-sources"
      aria-label={ariaLabel}
      className={cx(styles.root, className)}
    >
      {title === undefined ? null : (
        <header data-slot="agent-sources-title" className={styles.heading}>
          {title}
        </header>
      )}
      <ol data-slot="agent-sources-list" className={styles.list}>
        {children}
      </ol>
    </section>
  );
}

export function AgentSource({
  title,
  href,
  description,
  index,
  leading,
  trailing,
  className,
}: AgentSourceProps) {
  return (
    <li data-slot="agent-source" className={cx(styles.item, className)}>
      <span data-slot="agent-source-leading" className={styles.leading}>
        {leading ?? index}
      </span>
      <span data-slot="agent-source-content" className={styles.content}>
        {href === undefined ? (
          <span data-slot="agent-source-title" className={styles.title}>
            {title}
          </span>
        ) : (
          <a
            data-slot="agent-source-title"
            href={href}
            target="_blank"
            rel="noreferrer"
            className={styles.title}
          >
            {title}
          </a>
        )}
        {description === undefined ? null : (
          <span data-slot="agent-source-description" className={styles.description}>
            {description}
          </span>
        )}
      </span>
      {trailing === undefined ? null : (
        <span data-slot="agent-source-trailing" className={styles.trailing}>
          {trailing}
        </span>
      )}
    </li>
  );
}
