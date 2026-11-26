'use client';

import { useLocale, cn, type ToolCallMessagePartStatus } from '../../../../plugin-support.js';

export function ToolFallbackArgs({
  argsText,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  argsText?: string;
}) {
  if (!argsText) {
    return null;
  }

  return (
    <div data-slot='tool-fallback-args' className={cn('aui-tool-fallback-args', className)} {...props}>
      <pre className='aui-tool-fallback-args-value bg-muted/50 text-foreground/90 rounded-md p-2.5 text-xs break-words whitespace-pre-wrap'>
        {argsText}
      </pre>
    </div>
  );
}

export const formatUnknownValue = (value: unknown, space?: number): string => {
  if (typeof value === 'string') {
    return value;
  }

  try {
    if (value instanceof Error) {
      return String(value);
    }

    const json = JSON.stringify(value, null, space);
    if (json !== undefined) {
      return json;
    }
  } catch {}

  try {
    return String(value);
  } catch {
    return '[Unserializable value]';
  }
};

export function ToolFallbackResult({
  result,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  result?: unknown;
}) {
  const messages = useLocale('toolPresentation');
  if (result === undefined) {
    return null;
  }

  return (
    <div data-slot='tool-fallback-result' className={cn('aui-tool-fallback-result', className)} {...props}>
      <p className='aui-tool-fallback-result-header text-muted-foreground text-xs font-medium'>{messages.result}</p>
      <pre className='aui-tool-fallback-result-content bg-muted/50 text-foreground/90 mt-1 rounded-md p-2.5 text-xs break-words whitespace-pre-wrap'>
        {formatUnknownValue(result, 2)}
      </pre>
    </div>
  );
}

export function ToolFallbackError({
  status,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  status?: ToolCallMessagePartStatus;
}) {
  const messages = useLocale('toolPresentation');
  if (status?.type !== 'incomplete') {
    return null;
  }

  const error = status.error;
  const errorText = error === undefined || error === null ? null : formatUnknownValue(error);

  if (!errorText) {
    return null;
  }

  const isCancelled = status.reason === 'cancelled';
  const headerText = isCancelled ? messages.cancelReason : messages.error;

  const defaultView = (
    <div data-slot='tool-fallback-error' className={cn('aui-tool-fallback-error', className)} {...props}>
      <p className='aui-tool-fallback-error-header text-muted-foreground font-semibold'>{headerText}</p>
      <p className='aui-tool-fallback-error-reason text-muted-foreground break-words whitespace-pre-line'>
        {errorText}
      </p>
    </div>
  );
  return defaultView;
}
