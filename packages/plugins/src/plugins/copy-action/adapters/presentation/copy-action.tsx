'use client';
import { useEffect, useRef, useState, type ComponentProps, type FC, type ReactNode } from 'react';
import {
  CheckIcon,
  CopyIcon,
  TooltipIconButton,
  useLocale,
  useAssistantResponseRuntime,
} from '../../../../plugin-support.js';
export type CanonicalResponseCopyActionProps = Omit<
  ComponentProps<typeof TooltipIconButton>,
  'tooltip' | 'children'
> & { icon?: ReactNode };
export const CanonicalResponseCopyAction: FC<CanonicalResponseCopyActionProps> = ({
  icon,
  onClick,
  disabled: disabledProp,
  ...buttonProps
}) => {
  const localeMessages = useLocale();
  const text = useAssistantResponseRuntime(snapshot => snapshot.text);
  const isRunning = useAssistantResponseRuntime(snapshot => snapshot.isRunning);
  const headId = useAssistantResponseRuntime(snapshot => snapshot.group.headAssistantMessageId);
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
  }, [headId, text]);
  const disabled = isRunning || !text;
  return (
    <>
      <TooltipIconButton
        {...buttonProps}
        tooltip={localeMessages.common.copy}
        type='button'
        disabled={disabled || disabledProp}
        {...(copied ? { 'data-copied': 'true' } : {})}
        onClick={async (event) => {
          onClick?.(event);
          if (event.defaultPrevented || disabled || disabledProp) {
            return;
          }
          setFailed(false);
          const current = generation.current;
          try {
            await navigator.clipboard.writeText(text);
            if (current !== generation.current) {
              return;
            }
            clearTimeout(timer.current);
            setCopied(true);
            timer.current = setTimeout(() => setCopied(false), 3000);
          } catch (error) {
            if (current !== generation.current) {
              return;
            }
            setFailed(true);
            console.error('[agent-ui] response copy failed:', error);
          }
        }}
      >
        {copied ? (
          <CheckIcon data-slot='copy-action-copied' className='animate-in zoom-in-50 fade-in duration-200 ease-out' />
        ) : (
          (icon ?? <CopyIcon data-slot='copy-action-idle' className='animate-in zoom-in-75 fade-in duration-150' />)
        )}
      </TooltipIconButton>
      {failed && (
        <span role='status' data-slot='copy-action-error' className='text-destructive text-xs'>
          {localeMessages.copyAction.failed}
        </span>
      )}
    </>
  );
};

export { CanonicalResponseCopyAction as ConversationCanonicalResponseCopyAction };
