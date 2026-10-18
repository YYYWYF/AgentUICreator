"use client";
import { type FC, type ComponentProps } from "react";
import { useAgentUILocale, useAssistantResponseRuntime, TooltipIconButton, RefreshCwIcon } from "../../../../plugin-support.js";
export type CanonicalResponseReloadActionProps = Omit<ComponentProps<typeof TooltipIconButton>, "tooltip"> & { tooltip?: string };
export const CanonicalResponseReloadAction: FC<CanonicalResponseReloadActionProps> = ({ tooltip, children, onClick, disabled: disabledProp, ...buttonProps }) => {
  const localeMessages = useAgentUILocale();
  const response = useAssistantResponseRuntime();
  return (
    <TooltipIconButton {...buttonProps} tooltip={tooltip ?? localeMessages.common.refresh} type="button" disabled={!response.canReload || disabledProp} onClick={event => { onClick?.(event); if (!event.defaultPrevented && response.canReload && !disabledProp) response.reload(); }}>
      {children ?? <RefreshCwIcon />}
    </TooltipIconButton>
  );
};

export { CanonicalResponseReloadAction as ConversationCanonicalResponseReloadAction };
