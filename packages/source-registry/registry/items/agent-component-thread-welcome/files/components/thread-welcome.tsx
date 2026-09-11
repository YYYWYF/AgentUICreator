import type { ReactNode } from "react";

import { cx } from "../foundation/cx";
import styles from "./thread-welcome.module.css";

export interface AgentThreadWelcomeProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  meta?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function AgentThreadWelcome({
  title,
  description,
  eyebrow,
  icon,
  meta,
  ariaLabel,
  className,
}: AgentThreadWelcomeProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={cx(styles.root, className)}
      data-slot="agent-thread-welcome"
    >
      {icon === undefined || icon === null ? null : (
        <div
          aria-hidden="true"
          className={styles.icon}
          data-slot="agent-thread-welcome-icon"
        >
          {icon}
        </div>
      )}

      <div className={styles.body} data-slot="agent-thread-welcome-body">
        {eyebrow === undefined || eyebrow === null ? null : (
          <div
            className={styles.eyebrow}
            data-slot="agent-thread-welcome-eyebrow"
          >
            {eyebrow}
          </div>
        )}

        <h2 className={styles.title} data-slot="agent-thread-welcome-title">
          {title}
        </h2>

        {description === undefined || description === null ? null : (
          <p
            className={styles.description}
            data-slot="agent-thread-welcome-description"
          >
            {description}
          </p>
        )}

        {meta === undefined || meta === null ? null : (
          <div className={styles.meta} data-slot="agent-thread-welcome-meta">
            {meta}
          </div>
        )}
      </div>
    </section>
  );
}
