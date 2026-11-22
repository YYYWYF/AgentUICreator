import { useId, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { CirclePlusIcon, LayoutGridIcon } from 'lucide-react';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-runtime/contracts';
import {
  useLocale, usePluginService, ConversationTooltipIconButton,
  AgentUISidebarProvider, AgentUISidebar, AgentUISidebarHeader, AgentUISidebarContent,
  AgentUISidebarTrigger, AgentUISidebarMenu, AgentUISidebarMenuItem, AgentUISidebarMenuButton,
  useAgentUISidebar, type StackNavigationService, type StackNavigationSnapshot,
} from '../../../../public.js';

interface NavigationMenuItemBase {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
}
export type NavigationMenuItem = NavigationMenuItemBase & (
  | { readonly type: 'view'; readonly viewId: string }
  | { readonly type: 'action'; readonly onSelect: () => void | Promise<void> }
);
export interface NavigationMenuProps extends Omit<ComponentProps<'nav'>, 'children' | 'content'>, Partial<UIPluginComponentProps> {
  service?: StackNavigationService | undefined;
  stackId?: string | undefined;
  items?: readonly NavigationMenuItem[] | ((defaults: readonly NavigationMenuItem[]) => readonly NavigationMenuItem[]) | undefined;
  onNewConversation?: (() => void | Promise<void>) | undefined;
  presentation?: 'sidebar' | 'toolbar' | undefined;
  header?: ReactNode;
  content?: ReactNode;
  defaultOpen?: boolean | undefined;
}
const EMPTY: StackNavigationSnapshot = { stacks: {} };
export function NavigationMenu({
  service, stackId = 'main', items, onNewConversation, presentation = 'sidebar',
  header, content, defaultOpen = true, className, renderSlot,
  renderScopedSlot: _renderScopedSlot, ...props
}: NavigationMenuProps) {
  const messages = useLocale('navigationMenu');
  const snapshot = usePluginService(service, state => state, EMPTY);
  const state = Object.hasOwn(snapshot.stacks, stackId) ? snapshot.stacks[stackId] : undefined;
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const runningAction = useRef(false);
  const defaults: readonly NavigationMenuItem[] = [{
    id: 'new-chat', type: 'action', label: messages.newConversation, icon: <CirclePlusIcon />,
    disabled: !onNewConversation, onSelect: onNewConversation ?? (() => undefined),
  }];
  const choices = typeof items === 'function' ? items(defaults) : items ?? defaults;
  const unavailable = (item: NavigationMenuItem): boolean => !!item.disabled ||
    (item.type === 'view' ? !service || !state?.viewIds.includes(item.viewId) : pending !== null);
  const active = (item: NavigationMenuItem): boolean => item.type === 'view' && state?.activeViewId === item.viewId;
  const select = async (item: NavigationMenuItem): Promise<void> => {
    if (unavailable(item)) return;
    if (item.type === 'view') { service?.selectView(stackId, item.viewId); return; }
    if (runningAction.current) return;
    runningAction.current = true;
    setPending(item.id); setFailed(false);
    try { await item.onSelect(); }
    catch { setFailed(true); }
    finally { runningAction.current = false; setPending(null); }
  };
  const entries = <MenuEntries items={choices} toolbar={presentation === 'toolbar'} active={active}
    unavailable={unavailable} select={select} />;
  return <nav aria-label={messages.label} {...props} data-ui-plugin='navigation-menu'
    data-presentation={presentation} className={['navigation-menu', className].filter(Boolean).join(' ')}>
    {presentation === 'toolbar' ? entries :
      <AgentUISidebarProvider defaultOpen={defaultOpen} className='navigation-menu-provider'
        style={{ '--sidebar-width': '280px', '--sidebar-width-icon': '48px' } as CSSProperties}>
        <AgentUISidebar collapsible='icon' className='navigation-menu-sidebar'>
          <SidebarContents header={renderSlot?.('header', header) ?? header}
            content={renderSlot?.('content', content, { sizing: 'fill' }) ?? content} entries={entries} />
        </AgentUISidebar>
      </AgentUISidebarProvider>}
    {failed && <span className='navigation-menu-error' role='alert'>{messages.actionFailed}</span>}
  </nav>;
}
function MenuEntries({ items, toolbar, active, unavailable, select }: {
  items: readonly NavigationMenuItem[];
  toolbar: boolean;
  active: (item: NavigationMenuItem) => boolean;
  unavailable: (item: NavigationMenuItem) => boolean;
  select: (item: NavigationMenuItem) => Promise<void>;
}) {
  if (toolbar) return <>{items.map(item => <ConversationTooltipIconButton key={item.id} type='button'
    tooltip={item.label} aria-label={item.label} aria-current={active(item) ? 'page' : undefined}
    disabled={unavailable(item)} data-menu-item-id={item.id} data-menu-item-type={item.type}
    className='navigation-menu-toolbar-button' onClick={() => void select(item)}>
    <span className='navigation-menu-icon' aria-hidden='true'>{item.icon ?? <LayoutGridIcon />}</span>
  </ConversationTooltipIconButton>)}</>;
  return <AgentUISidebarMenu>{items.map(item => <AgentUISidebarMenuItem key={item.id}>
    <AgentUISidebarMenuButton type='button' isActive={active(item)} aria-label={item.label} tooltip={item.label}
      aria-current={active(item) ? 'page' : undefined} aria-disabled={unavailable(item) || undefined}
      data-menu-item-id={item.id} data-menu-item-type={item.type} onClick={() => void select(item)}>
      <span className='navigation-menu-icon' aria-hidden='true'>{item.icon ?? <LayoutGridIcon />}</span>
      <span className='navigation-menu-label'>{item.label}</span>
    </AgentUISidebarMenuButton>
  </AgentUISidebarMenuItem>)}</AgentUISidebarMenu>;
}
function SidebarContents({ header, content, entries }: { header: ReactNode; content: ReactNode; entries: ReactNode }) {
  const messages = useLocale('navigationMenu');
  const { open } = useAgentUISidebar();
  const contentId = useId();
  return <>
    <AgentUISidebarHeader className='navigation-menu-header'>
      <div className='navigation-menu-brand' hidden={!open} inert={!open}>{header}</div>
      <AgentUISidebarTrigger title={open ? messages.collapse : messages.expand}
        aria-label={open ? messages.collapse : messages.expand} aria-expanded={open} aria-controls={contentId} />
    </AgentUISidebarHeader>
    <AgentUISidebarContent className='navigation-menu-content' id={contentId}>
      {entries}
      <div className='navigation-menu-history' hidden={!open} inert={!open}>{content}</div>
    </AgentUISidebarContent>
  </>;
}
