"use client";
import { useEffect, useRef, useState, type FC, type ComponentProps } from "react";
import { useAgentUILocale, useAssistantResponseRuntime, TooltipIconButton, CheckIcon, CopyIcon } from "../../../../plugin-support.js";
export type CanonicalResponseCopyActionProps = Omit<ComponentProps<typeof TooltipIconButton>, "tooltip"> & { tooltip?: string };
export const CanonicalResponseCopyAction: FC<CanonicalResponseCopyActionProps> = ({ tooltip, children, onClick, disabled: disabledProp, ...buttonProps }) => {
  const localeMessages = useAgentUILocale();
  const response = useAssistantResponseRuntime();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  useEffect(() => {
    setCopied(false);
    setFailed(false);
    generation.current++;
    return () => {
      generation.current++;
      clearTimeout(timer.current);
    };
  }, [response.group.headAssistantMessageId, response.text]);
  const disabled = response.isRunning || !response.text;
  return (
    <><TooltipIconButton
      {...buttonProps}
      tooltip={tooltip ?? localeMessages.common.copy}
      type="button"
      disabled={disabled || disabledProp}
      {...(copied ? { "data-copied": "true" } : {})}
      onClick={async event => {
        onClick?.(event);
        if (event.defaultPrevented || disabled || disabledProp) return;
        setFailed(false);
        const current = generation.current;
        try {
          await navigator.clipboard.writeText(response.text);
          if (current !== generation.current) return;
          clearTimeout(timer.current);
          setCopied(true);
          timer.current = setTimeout(() => setCopied(false), 3000);
        } catch (error) {
          if (current !== generation.current) return;
          setFailed(true);
          console.error("[agent-ui] response copy failed:", error);
        }
      }}
    >
      {children ?? (copied ? (
        <CheckIcon data-slot="copy-action-copied" className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
      ) : (
        <CopyIcon data-slot="copy-action-idle" className="animate-in zoom-in-75 fade-in duration-150" />
      ))}
    </TooltipIconButton>
    {failed && <span role="status" data-slot="copy-action-error" className="text-destructive text-xs">{localeMessages.copyAction.failed}</span>}
    </>
  );
};

export { CanonicalResponseCopyAction as ConversationCanonicalResponseCopyAction };
