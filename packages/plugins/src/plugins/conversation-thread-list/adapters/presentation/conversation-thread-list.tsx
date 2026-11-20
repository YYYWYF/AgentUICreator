import type { ComponentProps, ReactNode } from 'react';
import { PlusIcon as Plus } from '../../../../plugin-support.js';
import {
  AgentUITooltip,
  AgentUITooltipContent,
  AgentUITooltipTrigger,
  Button,
  ConversationThreadListNew,
  getAgentUIThemeColorScheme,
  useLocale,
  useSidebarNavigation,
  useConversationNavigation,
} from '../../../../public.js';
import { PolicyThreadList, type PolicyThreadListProps } from './PolicyThreadList.js';
export interface ConversationThreadListPluginProps
  extends Omit<ComponentProps<'aside'>, 'children'>,
    Pick<PolicyThreadListProps, 'showSearch' | 'showArchived' | 'searchProps' | 'itemProps' | 'components'> {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  renderScopedSlot?: (name: string, scope: { kind: string; value: unknown }, fallback?: ReactNode) => ReactNode;
  headerActions?: ReactNode;
  renderList?: (defaultList: ReactNode) => ReactNode;
  snapshot?: {
    activeConversationId?: string | undefined;
    listStatus?: string;
    detailStatus?: string;
    listError?: string | undefined;
    detailError?: string | undefined;
    detailErrorConversationId?: string | undefined;
  };
  serviceAvailable?: boolean;
  onRefresh?: () => void | Promise<void>;
  theme?: string;
  runStatus?: string;
}
export function CanonicalConversationThreadList({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  showSearch,
  showArchived,
  searchProps,
  itemProps,
  components,
  renderList,
  headerActions,
  snapshot = {},
  onRefresh,
  serviceAvailable = false,
  theme = 'light',
  runStatus,
  ...rootProps
}: ConversationThreadListPluginProps) {
  const labels = useLocale('threadList');
  const conversationNavigation = useConversationNavigation();
  const defaultList = (
    <PolicyThreadList
      {...(showSearch === undefined ? {} : { showSearch })}
      {...(showArchived === undefined ? {} : { showArchived })}
      {...(searchProps === undefined ? {} : { searchProps })}
      {...(itemProps === undefined ? {} : { itemProps })}
      {...(components === undefined ? {} : { components })}
    />
  );

  return (
    <aside
      {...rootProps}
      className={[
        'conversation-thread-list-plugin agent-ui-conversation',
        getAgentUIThemeColorScheme(theme) === 'dark' ? 'dark' : undefined,
        rootProps?.className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-agent-run-status={runStatus}
      data-conversation-list-status={snapshot.listStatus}
      data-conversation-detail-status={snapshot.detailStatus}
      data-theme={theme}
      data-color-scheme={getAgentUIThemeColorScheme(theme)}
      data-ui-plugin='conversation-thread-list'
    >
      {headerActions && <div className='conversation-thread-list-header-actions'>{headerActions}</div>}
      {renderList ? renderList(defaultList) : defaultList}

      {snapshot.listStatus === 'error' ? (
        <div className='conversation-thread-list-error' role='alert'>
          <strong>{labels.loadFailed}</strong>
          {snapshot.listError === undefined ? null : <span>{snapshot.listError}</span>}
          <Button
            disabled={!serviceAvailable}
            onClick={() => {
              void onRefresh?.();
            }}
            size='sm'
            variant='outline'
          >
            {labels.retry}
          </Button>
        </div>
      ) : null}

      {snapshot.detailStatus === 'error' ? (
        <div className='conversation-thread-list-error' data-slot='agent-ui-thread-detail-error' role='alert'>
          <strong>{labels.historyFailed}</strong>
          {snapshot.detailError === undefined ? null : <span>{snapshot.detailError}</span>}
          <Button
            disabled={!serviceAvailable || snapshot.detailErrorConversationId === undefined}
            onClick={() => {
              const failedConversationId = snapshot.detailErrorConversationId;
              if (failedConversationId === undefined) {
                return;
              }
              if (snapshot.activeConversationId === failedConversationId) {
                void conversationNavigation.reloadCurrentThread();
              } else {
                void conversationNavigation.switchToThread(failedConversationId);
              }
            }}
            size='sm'
            variant='outline'
          >
            {labels.retry}
          </Button>
        </div>
      ) : null}
    </aside>
  );
}

export interface ConversationThreadListRailActionProps {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  enabled?: boolean;
  icon?: ReactNode;
  buttonProps?: Omit<ComponentProps<typeof ConversationThreadListNew>, 'children'>;
  tooltipProps?: Omit<ComponentProps<typeof AgentUITooltip>, 'children'>;
  tooltipContentProps?: Omit<ComponentProps<typeof AgentUITooltipContent>, 'children'>;
}
/** @deprecated Place the independent conversation-new Plugin in the application layout. */
export function CanonicalConversationThreadListRailAction({
  enabled = true,
  icon,
  buttonProps,
  tooltipProps,
  tooltipContentProps,
}: ConversationThreadListRailActionProps) {
  const labels = useLocale('threadList');
  const navigate = useSidebarNavigation();
  if (!enabled) {
    return null;
  }
  return (
    <AgentUITooltip {...tooltipProps}>
      <AgentUITooltipTrigger
        render={
          <ConversationThreadListNew
            className='conversation-thread-list-rail-new'
            aria-label={labels.newThread}
            {...buttonProps}
            onClick={(event) => {
              buttonProps?.onClick?.(event);
              if (!event.defaultPrevented) {
                navigate();
              }
            }}
          >
            {icon ?? <Plus aria-hidden='true' />}
          </ConversationThreadListNew>
        }
      />
      <AgentUITooltipContent side='right' {...tooltipContentProps}>
        {labels.newThread}
      </AgentUITooltipContent>
    </AgentUITooltip>
  );
}
