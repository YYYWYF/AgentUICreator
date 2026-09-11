import type { ReactNode } from "react";

import { cx } from "../foundation/cx";
import styles from "./suggestions.module.css";

export interface AgentSuggestionProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
  className?: string;
}

export function AgentSuggestion({
  title,
  description,
  icon,
  disabled = false,
  onSelect,
  className,
}: AgentSuggestionProps) {
  return (
    <button
      className={cx(styles.suggestion, className)}
      data-slot="agent-suggestion"
      disabled={disabled}
      onClick={() => onSelect?.()}
      type="button"
    >
      {icon === undefined || icon === null ? null : (
        <span
          aria-hidden="true"
          className={styles.suggestionIcon}
          data-slot="agent-suggestion-icon"
        >
          {icon}
        </span>
      )}

      <span className={styles.suggestionBody} data-slot="agent-suggestion-body">
        <span
          className={styles.suggestionTitle}
          data-slot="agent-suggestion-title"
        >
          {title}
        </span>

        {description === undefined || description === null ? null : (
          <span
            className={styles.suggestionDescription}
            data-slot="agent-suggestion-description"
          >
            {description}
          </span>
        )}
      </span>
    </button>
  );
}

export interface AgentSuggestionsProps {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AgentSuggestions({
  title,
  children,
  className,
}: AgentSuggestionsProps) {
  return (
    <section
      className={cx(styles.root, className)}
      data-slot="agent-suggestions"
    >
      {title === undefined || title === null ? null : (
        <h3 className={styles.title} data-slot="agent-suggestions-title">
          {title}
        </h3>
      )}

      <div className={styles.list} data-slot="agent-suggestions-list">
        {children}
      </div>
    </section>
  );
}
