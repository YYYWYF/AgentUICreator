'use client';
import { type ComponentProps, type FC, type ReactNode } from 'react';
import {
  RefreshCwIcon,
  TooltipIconButton,
  useAgentUILocale,
  useAssistantResponseRuntime,
} from '../../../../plugin-support.js';
export type CanonicalResponseReloadActionProps = Omit<
  ComponentProps<typeof TooltipIconButton>,
  'tooltip' | 'children'
> & { icon?: ReactNode };
export const CanonicalResponseReloadAction: FC<CanonicalResponseReloadActionProps> = ({
  icon,
  onClick,
  disabled: disabledProp,
  ...buttonProps
}) => {
  const localeMessages = useAgentUILocale();
  const response = useAssistantResponseRuntime();
  return (
    <TooltipIconButton
      {...buttonProps}
      tooltip={localeMessages.common.refresh}
      type='button'
      disabled={!response.canReload || disabledProp}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && response.canReload && !disabledProp) {
          response.reload();
        }
      }}
    >
      {icon ?? <RefreshCwIcon />}
    </TooltipIconButton>
  );
};

export { CanonicalResponseReloadAction as ConversationCanonicalResponseReloadAction };
