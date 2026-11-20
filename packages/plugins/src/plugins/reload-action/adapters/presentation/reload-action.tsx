'use client';
import { type ComponentProps, type FC, type ReactNode } from 'react';
import {
  RefreshCwIcon,
  TooltipIconButton,
  useLocale,
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
  const localeMessages = useLocale();
  const response = useAssistantResponseRuntime();
  const canReload = useAssistantResponseRuntime(snapshot => snapshot.canReload);
  return (
    <TooltipIconButton
      {...buttonProps}
      tooltip={localeMessages.common.refresh}
      type='button'
      disabled={!canReload || disabledProp}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && canReload && !disabledProp) {
          response.reload();
        }
      }}
    >
      {icon ?? <RefreshCwIcon />}
    </TooltipIconButton>
  );
};

export { CanonicalResponseReloadAction as ConversationCanonicalResponseReloadAction };
