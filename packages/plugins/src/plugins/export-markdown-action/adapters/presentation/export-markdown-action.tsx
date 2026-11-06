'use client';
import { type ComponentProps, type FC } from 'react';
import {
  ConversationActionMoreMenuItem,
  DownloadIcon,
  TooltipIconButton,
  useAgentUILocale,
  useAssistantResponseRuntime,
} from '../../../../plugin-support.js';
export type ResponseExportMarkdownActionProps = Omit<ComponentProps<typeof TooltipIconButton>, 'tooltip'> & {
  presentation?: 'button' | 'menu';
  menuItemProps?: Partial<ComponentProps<typeof ConversationActionMoreMenuItem>>;
};
export const CanonicalResponseExportMarkdownAction: FC<ResponseExportMarkdownActionProps> = ({
  presentation = 'button',
  menuItemProps,
  ...buttonProps
}) => {
  const localeMessages = useAgentUILocale();
  const response = useAssistantResponseRuntime();
  const disabled = response.isRunning || !response.text;
  const exportMarkdown = () => {
    if (disabled) {
      return;
    }
    const blob = new Blob([response.text], { type: 'text/markdown' });
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
  if (presentation === 'menu') {
    return (
      <ConversationActionMoreMenuItem
        {...menuItemProps}
        disabled={disabled || Boolean(menuItemProps?.disabled)}
        onSelect={(event) => {
          menuItemProps?.onSelect?.(event);
          if (!event.defaultPrevented) {
            exportMarkdown();
          }
        }}
      >
        {menuItemProps?.children ?? (
          <>
            <DownloadIcon className='size-4' />
            {localeMessages.conversation.exportMarkdown}
          </>
        )}
      </ConversationActionMoreMenuItem>
    );
  }
  return (
    <TooltipIconButton
      tooltip={localeMessages.conversation.exportMarkdown}
      type='button'
      {...buttonProps}
      disabled={disabled || buttonProps?.disabled}
      onClick={(event) => {
        buttonProps?.onClick?.(event);
        if (!event.defaultPrevented) {
          exportMarkdown();
        }
      }}
    >
      {buttonProps?.children ?? <DownloadIcon />}
    </TooltipIconButton>
  );
};

export { CanonicalResponseExportMarkdownAction as ConversationCanonicalResponseExportMarkdownAction };
