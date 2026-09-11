import type { ReactNode, Ref } from "react";

import { cx } from "../foundation/cx";
import styles from "./thread.module.css";

export interface AgentThreadProps {
  children?: ReactNode;
  empty?: ReactNode;
  scrollToBottom?: ReactNode;
  viewportRef?: Ref<HTMLDivElement>;
  contentRef?: Ref<HTMLDivElement>;
  ariaLabel?: string;
  className?: string;
}

export function AgentThread({
  children,
  empty,
  scrollToBottom,
  viewportRef,
  contentRef,
  ariaLabel,
  className,
}: AgentThreadProps) {
  const content = children ?? empty;

  return (
    <section
      aria-label={ariaLabel}
      className={cx(styles.root, className)}
      data-slot="agent-thread"
    >
      <div
        className={styles.viewport}
        data-slot="agent-thread-viewport"
        ref={viewportRef}
      >
        <div
          className={styles.content}
          data-slot="agent-thread-content"
          ref={contentRef}
        >
          {content}
        </div>
      </div>

      {scrollToBottom === null || scrollToBottom === undefined ? null : (
        <div
          className={styles.scrollToBottom}
          data-slot="agent-thread-scroll-to-bottom"
        >
          {scrollToBottom}
        </div>
      )}
    </section>
  );
}
