import type { ComponentProps, ReactNode } from 'react';
import { PlusIcon as Plus } from '../../../../plugin-support.js';
import {
  AgentUITooltip,
  AgentUITooltipContent,
  AgentUITooltipTrigger,
  ConversationThreadListNew,
  useAgentUILocale,
  useAgentUISidebarNavigation,
} from '../../../../public.js';
export interface ConversationNewPluginProps extends Omit<ComponentProps<'div'>, 'children' | 'onClick'> {
  showLabel?: boolean;
  disabled?: boolean;
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  renderScopedSlot?: (name: string, scope: { kind: string; value: unknown }, fallback?: ReactNode) => ReactNode;
  buttonProps?: Omit<ComponentProps<typeof ConversationThreadListNew>, 'children' | 'disabled'>;
  tooltipProps?: Omit<ComponentProps<typeof AgentUITooltip>, 'children'>;
  tooltipContentProps?: Omit<ComponentProps<typeof AgentUITooltipContent>, 'children'>;
  icon?: ReactNode;
}
export function CanonicalConversationNew({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  buttonProps,
  tooltipProps,
  tooltipContentProps,
  icon,
  showLabel = true,
  disabled,
  ...rootProps
}: ConversationNewPluginProps) {
  const onNavigate = useAgentUISidebarNavigation();
  const messages = useAgentUILocale('threadList');
  return (
    <div
      {...rootProps}
      className={['conversation-new-plugin', rootProps.className].filter(Boolean).join(' ')}
      data-ui-plugin='conversation-new'
      data-show-label={showLabel}
    >
      <AgentUITooltip {...tooltipProps}>
        <AgentUITooltipTrigger
          render={
            <ConversationThreadListNew
              disabled={disabled}
              aria-label={messages.newThread}
              {...buttonProps}
              className={['conversation-new-button', buttonProps?.className].filter(Boolean).join(' ')}
              onClick={(event) => {
                buttonProps?.onClick?.(event);
                if (!event.defaultPrevented) {
                  onNavigate();
                }
              }}
            >
              {showLabel && icon === undefined ? (
                messages.newThread
              ) : (
                <>
                  {icon ?? <Plus data-slot='aui_thread-list-new-icon' className='size-4 shrink-0' aria-hidden='true' />}
                  {showLabel && messages.newThread}
                </>
              )}
            </ConversationThreadListNew>
          }
        />
        <AgentUITooltipContent {...tooltipContentProps}>{messages.newThread}</AgentUITooltipContent>
      </AgentUITooltip>
    </div>
  );
}
