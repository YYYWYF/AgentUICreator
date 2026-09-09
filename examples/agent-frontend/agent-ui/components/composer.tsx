import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";

import { cx } from "../foundation/cx";
import { Button } from "../primitives/button";
import { Textarea, type TextareaProps } from "../primitives/textarea";
import styles from "./composer.module.css";

const MAX_INPUT_HEIGHT_PX = 192;

export interface AgentComposerLabels {
  input: string;
  send: string;
  stop: string;
  running: string;
}

const defaultLabels: AgentComposerLabels = {
  input: "Message input",
  send: "Send message",
  stop: "Stop generation",
  running: "Generation in progress",
};

export interface AgentComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (value: string) => void;
  running?: boolean;
  onStop?: () => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  actions?: ReactNode;
  inputProps?: AgentComposerInputProps;
  onInputKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  labels?: Partial<AgentComposerLabels>;
  className?: string;
}

export type AgentComposerInputProps = Omit<
  TextareaProps,
  | "value"
  | "defaultValue"
  | "onChange"
  | "onKeyDown"
  | "onCompositionStart"
  | "onCompositionEnd"
  | "disabled"
  | "placeholder"
  | "autoFocus"
  | "rows"
  | "ref"
  | "variant"
  | "aria-label"
  | "className"
  | "enterKeyHint"
>;

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M10 15.5V4.5M5.5 9 10 4.5 14.5 9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <rect x="6" y="6" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function AgentComposer({
  value,
  onValueChange,
  onSubmit,
  running = false,
  onStop,
  disabled = false,
  placeholder = "Write a message...",
  autoFocus = false,
  actions,
  inputProps,
  onInputKeyDown,
  labels,
  className,
}: AgentComposerProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const compositionRef = useRef(false);
  const canSubmit = !disabled && !running && value.trim().length > 0;
  const resolvedLabels = { ...defaultLabels, ...labels };

  const resizeTextarea = useCallback((element: HTMLTextAreaElement | null) => {
    if (element === null) return;
    element.style.height = "auto";
    element.style.maxHeight = `${MAX_INPUT_HEIGHT_PX}px`;
    const nextHeight = Math.min(element.scrollHeight, MAX_INPUT_HEIGHT_PX);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > MAX_INPUT_HEIGHT_PX
      ? "auto"
      : "hidden";
  }, []);

  useLayoutEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [resizeTextarea, value]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    resizeTextarea(event.currentTarget);
    onValueChange(event.currentTarget.value);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onInputKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent & {
      keyCode?: number;
    };
    if (
      compositionRef.current ||
      nativeEvent.isComposing ||
      nativeEvent.keyCode === 229
    ) {
      return;
    }
    if (!canSubmit) return;
    event.preventDefault();
    formRef.current?.requestSubmit();
  };

  return (
    <form
      ref={formRef}
      data-slot="agent-composer"
      data-state={disabled ? "disabled" : running ? "running" : "idle"}
      className={cx(styles.root, className)}
      onSubmit={handleSubmit}
    >
      <div data-slot="agent-composer-input" className={styles.inputRegion}>
        <Textarea
          {...inputProps}
          ref={textareaRef}
          variant="bare"
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          autoFocus={autoFocus}
          enterKeyHint="send"
          aria-label={resolvedLabels.input}
          className={styles.input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            compositionRef.current = true;
          }}
          onCompositionEnd={() => {
            compositionRef.current = false;
          }}
        />
      </div>
      <footer data-slot="agent-composer-footer" className={styles.footer}>
        <div data-slot="agent-composer-actions" className={styles.actions}>
          {actions}
        </div>
        <div data-slot="agent-composer-primary-action" className={styles.primaryAction}>
          {running ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              aria-label={onStop === undefined ? resolvedLabels.running : resolvedLabels.stop}
              data-slot="agent-composer-stop"
              disabled={disabled || onStop === undefined}
              className={styles.actionButton}
              onClick={onStop}
            >
              <StopIcon />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              aria-label={resolvedLabels.send}
              data-slot="agent-composer-submit"
              disabled={!canSubmit}
              className={styles.actionButton}
            >
              <SendIcon />
            </Button>
          )}
        </div>
      </footer>
    </form>
  );
}
