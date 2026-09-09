import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";

import type { AgentComposerSuggestionItem } from "../../agent-ui/components/composer-suggestions";
import type { AgentComposerBinding } from "./use-agent-composer-binding";

interface UseComposerSuggestionsOptions {
  binding: AgentComposerBinding;
  suggestions: readonly AgentComposerSuggestionItem[];
}

export interface ComposerSuggestionsController {
  open: boolean;
  activeIndex: number;
  listId: string;
  onOpenChange: (open: boolean) => void;
  onActiveIndexChange: (index: number) => void;
  onValueChange: (value: string) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSelect: (item: AgentComposerSuggestionItem, index: number) => void;
  onSubmit: (value: string) => void;
}

export function useComposerSuggestions({
  binding,
  suggestions,
}: UseComposerSuggestionsOptions): ComposerSuggestionsController {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const reactId = useId();
  const listId = useMemo(
    () => `agent-composer-suggestions-${reactId.replaceAll(":", "")}`,
    [reactId],
  );

  useEffect(() => {
    if (binding.historyMode || suggestions.length === 0) {
      setOpen(false);
      setActiveIndex(0);
      return;
    }
    setActiveIndex((current) => Math.min(current, suggestions.length - 1));
  }, [binding.historyMode, suggestions.length]);

  const onOpenChange = useCallback((nextOpen: boolean) => {
    if (binding.historyMode || suggestions.length === 0) {
      setOpen(false);
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) setActiveIndex(0);
  }, [binding.historyMode, suggestions.length]);

  const onActiveIndexChange = useCallback((index: number) => {
    if (
      binding.historyMode ||
      !open ||
      index < 0 ||
      index >= suggestions.length
    ) {
      return;
    }
    setActiveIndex(index);
  }, [binding.historyMode, open, suggestions.length]);

  const onValueChange = useCallback((nextValue: string) => {
    if (binding.historyMode) {
      setOpen(false);
      return;
    }
    binding.onValueChange(nextValue);
    if (nextValue === "/" && suggestions.length > 0) {
      setActiveIndex(0);
      setOpen(true);
      return;
    }
    setOpen(false);
  }, [binding, suggestions.length]);

  const onSelect = useCallback((
    item: AgentComposerSuggestionItem,
    index: number,
  ) => {
    if (
      binding.historyMode ||
      index < 0 ||
      index >= suggestions.length ||
      suggestions[index]?.id !== item.id
    ) {
      return;
    }
    binding.onValueChange(`${item.value} `);
    setOpen(false);
  }, [binding, suggestions]);

  const onInputKeyDown = useCallback((
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (!open || binding.historyMode || suggestions.length === 0) return;
    const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent & {
      keyCode?: number;
    };
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        (current - 1 + suggestions.length) % suggestions.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const activeSuggestion = suggestions[activeIndex];
      if (activeSuggestion !== undefined) {
        onSelect(activeSuggestion, activeIndex);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }, [activeIndex, binding.historyMode, onSelect, open, suggestions]);

  const onSubmit = useCallback((value: string) => {
    setOpen(false);
    if (binding.historyMode) return;
    binding.onSubmit(value);
  }, [binding]);

  return {
    open,
    activeIndex,
    listId,
    onOpenChange,
    onActiveIndexChange,
    onValueChange,
    onInputKeyDown,
    onSelect,
    onSubmit,
  };
}
