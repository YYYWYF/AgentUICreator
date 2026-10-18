"use client";
import { type FC, type ComponentProps } from "react";
import { useAgentUILocale, useAssistantResponseRuntime, TooltipIconButton, DownloadIcon, ConversationActionMoreMenuItem } from "../../../../plugin-support.js";
export const CanonicalResponseExportMarkdownAction: FC<{ menuLabel?: string; buttonProps?: Partial<ComponentProps<typeof TooltipIconButton>>; menuItemProps?: Partial<ComponentProps<typeof ConversationActionMoreMenuItem>> }> = ({ menuLabel, buttonProps, menuItemProps }) => {
  const localeMessages = useAgentUILocale();
  const response = useAssistantResponseRuntime();
  const disabled = response.isRunning || !response.text;
  const exportMarkdown = () => {
    if (disabled) return;
    const blob = new Blob([response.text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `response-${Date.now()}.md`;
      anchor.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 40_000);
    }
  };
  if (menuLabel !== undefined) {
    return <ConversationActionMoreMenuItem {...menuItemProps} disabled={disabled || Boolean(menuItemProps?.disabled)} onSelect={event => { menuItemProps?.onSelect?.(event); if (!event.defaultPrevented) exportMarkdown(); }}>
      {menuItemProps?.children ?? <><DownloadIcon className="size-4" />{menuLabel}</>}
    </ConversationActionMoreMenuItem>;
  }
  return <TooltipIconButton tooltip={localeMessages.conversation.exportMarkdown} type="button" {...buttonProps} disabled={disabled || buttonProps?.disabled} onClick={event => { buttonProps?.onClick?.(event); if (!event.defaultPrevented) exportMarkdown(); }}>
    {buttonProps?.children ?? <DownloadIcon />}
  </TooltipIconButton>;
};

export { CanonicalResponseExportMarkdownAction as ConversationCanonicalResponseExportMarkdownAction };
