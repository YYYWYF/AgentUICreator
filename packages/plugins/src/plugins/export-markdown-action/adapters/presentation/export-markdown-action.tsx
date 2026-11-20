'use client';
import { type ComponentProps, type FC, type ReactNode } from 'react';
import {
  ConversationActionMoreMenuItem,
  DownloadIcon,
  TooltipIconButton,
  useLocale,
  useAssistantResponseRuntime,
} from '../../../../plugin-support.js';
export type ResponseExportMarkdownActionProps =
  | (Omit<ComponentProps<typeof TooltipIconButton>, 'tooltip' | 'children'> & {
      presentation?: 'button';
      icon?: ReactNode;
    })
  | (Omit<ComponentProps<typeof ConversationActionMoreMenuItem>, 'children'> & {
      presentation: 'menu';
      icon?: ReactNode;
    });
export const CanonicalResponseExportMarkdownAction: FC<ResponseExportMarkdownActionProps> = (props) => {
  const localeMessages = useLocale();
  const text = useAssistantResponseRuntime(snapshot => snapshot.text);
  const isRunning = useAssistantResponseRuntime(snapshot => snapshot.isRunning);
  const disabled = isRunning || !text;
  const exportMarkdown = () => {
    if (disabled) return;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `response-${Date.now()}.md`;
      anchor.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 40_000);
    }
  };
  if (props.presentation === 'menu') {
    const { presentation: _presentation, icon, ...menuProps } = props;
    return (
      <ConversationActionMoreMenuItem
        {...menuProps}
        disabled={disabled || !!menuProps.disabled}
        onSelect={(event) => {
          menuProps.onSelect?.(event);
          if (!event.defaultPrevented) exportMarkdown();
        }}
      >
        {icon ?? <DownloadIcon className='size-4' />}
        {localeMessages.conversation.exportMarkdown}
      </ConversationActionMoreMenuItem>
    );
  }
  const { presentation: _presentation, icon, ...buttonProps } = props;
  return (
    <TooltipIconButton
      {...buttonProps}
      tooltip={localeMessages.conversation.exportMarkdown}
      type='button'
      disabled={disabled || buttonProps.disabled}
      onClick={(event) => {
        buttonProps.onClick?.(event);
        if (!event.defaultPrevented) exportMarkdown();
      }}
    >
      {icon ?? <DownloadIcon />}
    </TooltipIconButton>
  );
};
export { CanonicalResponseExportMarkdownAction as ConversationCanonicalResponseExportMarkdownAction };
