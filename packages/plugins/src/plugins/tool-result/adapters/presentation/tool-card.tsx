'use client';

import { useCallback, useRef, useState } from 'react';
import {
  useLocale,
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  LoaderIcon,
  XCircleIcon,
  cn,
  FallbackDisclosure as Collapsible,
  FallbackDisclosureContent as CollapsibleContent,
  FallbackDisclosureTrigger as CollapsibleTrigger,
  useScrollLock,
  useToolCallElapsed,
  type ToolCallMessagePart,
  type ToolCallMessagePartStatus,
} from '../../../../plugin-support.js';

const ANIMATION_DURATION = 200;

export type ToolFallbackRootProps = Omit<React.ComponentProps<typeof Collapsible>, 'open' | 'onOpenChange'> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
};

export function ToolFallbackRoot({
  className,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
  ...props
}: ToolFallbackRootProps) {
  const collapsibleRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      lockScroll();
      if (!isControlled) {
        setUncontrolledOpen(open);
      }
      controlledOnOpenChange?.(open);
    },
    [lockScroll, isControlled, controlledOnOpenChange],
  );

  return (
    <Collapsible
      ref={collapsibleRef}
      data-slot='tool-fallback-root'
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn('aui-tool-fallback-root group/tool-fallback-root w-full', className)}
      style={
        {
          '--animation-duration': `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </Collapsible>
  );
}

type ToolStatus = ToolCallMessagePartStatus['type'];

// Resolve shared exports at render time; the support barrel also exposes
// response controls that import this presentation during module initialization.
const statusIcon = (status: ToolStatus): React.ElementType =>
  ({
    running: LoaderIcon,
    complete: CheckIcon,
    incomplete: XCircleIcon,
    'requires-action': AlertCircleIcon,
  })[status];

const formatToolDuration = (ms: number) => {
  if (ms < 1000) {
    return '<1s';
  }
  const seconds = ms / 1000;
  if (seconds < 10) {
    return `${(Math.floor(seconds * 10) / 10).toFixed(1)}s`;
  }
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
};

function ToolFallbackDuration({ className, ...props }: React.ComponentProps<'span'>) {
  const elapsedMs = useToolCallElapsed();
  if (elapsedMs === undefined) {
    return null;
  }

  return (
    <span
      data-slot='tool-fallback-duration'
      className={cn('aui-tool-fallback-duration text-muted-foreground text-xs tabular-nums', className)}
      {...props}
    >
      {formatToolDuration(elapsedMs)}
    </span>
  );
}

export function ToolFallbackTrigger({
  toolName,
  status,
  responseDeliveryStatus,
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  toolName: string;
  status?: ToolCallMessagePartStatus;
  responseDeliveryStatus?: ToolCallMessagePart['responseDeliveryStatus'];
}) {
  const messages = useLocale('toolPresentation');
  const statusType = status?.type ?? 'complete';
  const isRunning = statusType === 'running';
  const isCancelled = status?.type === 'incomplete' && status.reason === 'cancelled';

  const Icon = statusIcon(statusType);
  const label =
    responseDeliveryStatus === 'queued'
      ? messages.replyQueued
      : statusType === 'running'
        ? messages.running
        : statusType === 'requires-action'
          ? messages.waiting
          : statusType === 'incomplete'
            ? isCancelled
              ? messages.cancelled
              : messages.failed
            : messages.used;

  return (
    <CollapsibleTrigger
      data-slot='tool-fallback-trigger'
      className={cn(
        'aui-tool-fallback-trigger group/trigger text-muted-foreground hover:text-foreground flex w-fit max-w-full origin-left items-center gap-2 py-1.5 text-sm transition-[color,scale] active:scale-[0.98]',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <Icon
            data-slot='tool-fallback-trigger-icon'
            className={cn(
              'aui-tool-fallback-trigger-icon size-4 shrink-0',
              isCancelled && 'text-muted-foreground',
              isRunning && 'animate-spin [animation-duration:0.6s]',
            )}
          />
          <span
            data-slot='tool-fallback-trigger-label'
            className={cn(
              'aui-tool-fallback-trigger-label-wrapper inline-block min-w-0 text-start leading-none wrap-anywhere',
              isCancelled && 'text-muted-foreground line-through',
              isRunning && 'shimmer motion-reduce:animate-none',
            )}
          >
            {label}: <b>{toolName}</b>
          </span>
          <ToolFallbackDuration />
          <ChevronDownIcon
            data-slot='tool-fallback-trigger-chevron'
            className={cn(
              'aui-tool-fallback-trigger-chevron size-4 shrink-0',
              'transition-transform duration-(--animation-duration) ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
              '-rotate-90',
              'group-data-open/trigger:rotate-0',
              'group-data-panel-open/trigger:rotate-0',
            )}
          />
        </>
      )}
    </CollapsibleTrigger>
  );
}

export function ToolFallbackContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot='tool-fallback-content'
      className={cn(
        'aui-tool-fallback-content relative overflow-hidden text-sm outline-none',
        'group/collapsible-content ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none',
        'data-closed:animate-collapsible-up',
        'data-open:animate-collapsible-down',
        'data-closed:fill-mode-forwards',
        'data-closed:pointer-events-none',
        '[--tw-duration:var(--animation-duration)]',
        className,
      )}
      {...props}
    >
      <div
        data-agent-ui-owned=''
        className={cn(
          'flex flex-col gap-2 ps-6 pt-1 pb-2 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none',
          'group-data-open/collapsible-content:animate-in group-data-open/collapsible-content:fade-in-0 group-data-open/collapsible-content:blur-in-[2px] group-data-open/collapsible-content:slide-in-from-top-1',
          'group-data-closed/collapsible-content:animate-out group-data-closed/collapsible-content:fade-out-0 group-data-closed/collapsible-content:blur-out-[2px] group-data-closed/collapsible-content:slide-out-to-top-1',
          'group-data-closed/collapsible-content:animation-duration-(--animation-duration) group-data-open/collapsible-content:animation-duration-(--animation-duration)',
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}
