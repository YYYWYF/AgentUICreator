import type { ReactNode, RefObject } from "react";

import { cx } from "../foundation/cx";
import { Popover, PopoverContent } from "../primitives/popover";
import styles from "./composer-suggestions.module.css";

export interface AgentComposerSuggestionItem {
  id: string;
  label: ReactNode;
  value: string;
  description?: ReactNode;
}

export interface AgentComposerSuggestionsProps {
  open: boolean;
  items: readonly AgentComposerSuggestionItem[];
  activeIndex: number;
  anchor: RefObject<Element | null>;
  listId: string;
  ariaLabel?: string;
  onOpenChange?: (open: boolean) => void;
  onActiveIndexChange?: (index: number) => void;
  onSelect: (item: AgentComposerSuggestionItem, index: number) => void;
  className?: string;
}

export function getAgentComposerSuggestionOptionId(
  listId: string,
  itemId: string,
): string {
  return `${listId}--${itemId}`;
}

export function AgentComposerSuggestions({
  open,
  items,
  activeIndex,
  anchor,
  listId,
  ariaLabel = "Composer suggestions",
  onOpenChange,
  onActiveIndexChange,
  onSelect,
  className,
}: AgentComposerSuggestionsProps) {
  return (
    <Popover open={open} onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}>
      <PopoverContent
        id={listId}
        role="listbox"
        aria-label={ariaLabel}
        data-slot="agent-composer-suggestions"
        anchor={anchor}
        align="start"
        side="top"
        sideOffset={8}
        initialFocus={false}
        finalFocus={false}
        className={cx(styles.root, className)}
      >
        {items.map((item, index) => {
          const active = index === activeIndex;
          return (
            <button
              id={getAgentComposerSuggestionOptionId(listId, item.id)}
              key={item.id}
              type="button"
              role="option"
              aria-selected={active}
              tabIndex={-1}
              data-slot="agent-composer-suggestion"
              data-active={active ? "" : undefined}
              className={styles.option}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onMouseEnter={() => onActiveIndexChange?.(index)}
              onClick={() => onSelect(item, index)}
            >
              <span className={styles.label}>{item.label}</span>
              {item.description === undefined ? null : (
                <span className={styles.description}>{item.description}</span>
              )}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
