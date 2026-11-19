import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FileTextIcon, PanelRightIcon, XIcon } from 'lucide-react';
import { useAgentUILocale, usePluginServiceSnapshot } from '../../../../public.js';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import type { WorkbenchPanelService, WorkbenchPanelSnapshot } from './service.js';

export interface WorkbenchPanelItem {
  id: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
}
export interface WorkbenchPanelProps extends Partial<UIPluginComponentProps> {
  service?: WorkbenchPanelService | undefined;
  items?: readonly WorkbenchPanelItem[] | undefined;
  renderMain?: () => ReactNode;
  mainActions?: ReactNode;
  open?: boolean | undefined;
  activeItemId?: string | undefined;
  visibleItemIds?: readonly string[] | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  onActiveItemChange?: ((id: string) => void) | undefined;
  onVisibleItemsChange?: ((ids: readonly string[]) => void) | undefined;
  panelWidth?: number | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}
const CLOSED: WorkbenchPanelSnapshot = { open: false, activeItemId: '', visibleItemIds: [] };
export function WorkbenchPanel({
  service,
  items: suppliedItems,
  renderSlot,
  renderMain,
  mainActions,
  open: controlledOpen,
  activeItemId: controlledActive,
  visibleItemIds: controlledVisible,
  onOpenChange,
  onActiveItemChange,
  onVisibleItemsChange,
  panelWidth = 360,
  className,
  style,
}: WorkbenchPanelProps) {
  const messages = useAgentUILocale('workbenchPanel');
  const snapshot = usePluginServiceSnapshot(service, CLOSED);
  const open = controlledOpen ?? snapshot.open;
  const activeId = controlledActive ?? snapshot.activeItemId;
  const id = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const [closedItemIds, setClosedItemIds] = useState<readonly string[]>([]);
  const items = suppliedItems ?? [];
  const visibleItemIds =
    controlledVisible ??
    (service
      ? snapshot.visibleItemIds
      : items.filter((item) => !closedItemIds.includes(item.id)).map((item) => item.id));
  const visibleItems = visibleItemIds.flatMap((itemId) => {
    const item = items.find((candidate) => candidate.id === itemId);
    return item ? [item] : [];
  });
  const active = visibleItems.find((item) => item.id === activeId) ?? visibleItems[0];
  const expanded = open && !!active;
  const mainContent = renderMain?.();
  function restore() {
    const itemId = active?.id ?? items.find((item) => item.id === activeId)?.id ?? items[0]?.id;
    if (!itemId) return;
    service?.open(itemId);
    if (!visibleItemIds.includes(itemId)) {
      if (!service) setClosedItemIds((previous) => previous.filter((id) => id !== itemId));
      onVisibleItemsChange?.([...visibleItemIds, itemId]);
    }
    onActiveItemChange?.(itemId);
    onOpenChange?.(true);
  }
  function select(itemId: string) {
    service?.open(itemId);
    onActiveItemChange?.(itemId);
    onOpenChange?.(true);
  }
  function collapse() {
    service?.collapse();
    onOpenChange?.(false);
  }
  function close(itemId: string) {
    const index = visibleItems.findIndex((item) => item.id === itemId);
    const remaining = visibleItems.filter((item) => item.id !== itemId);
    const next = active?.id === itemId ? remaining[Math.min(index, remaining.length - 1)] : active;
    service?.close(itemId);
    if (!service) setClosedItemIds((previous) => [...previous, itemId]);
    onVisibleItemsChange?.(remaining.map((item) => item.id));
    if (next) {
      if (next.id !== active?.id) onActiveItemChange?.(next.id);
      tabRefs.current.get(next.id)?.focus({ preventScroll: true });
    } else {
      onOpenChange?.(false);
      toggleRef.current?.focus({ preventScroll: true });
    }
  }
  return (
    <section
      data-ui-plugin='workbench-panel'
      data-open={expanded}
      className={['workbench-panel', className].filter(Boolean).join(' ')}
      style={{
        ...style,
        gridTemplateColumns: expanded ? `minmax(0, 1fr) min(${Math.max(0, panelWidth)}px, 45%)` : 'minmax(0, 1fr) 48px',
      }}
    >
      <div className='workbench-panel-main'>
        <div className='workbench-panel-main-actions'>{renderSlot?.('mainActions', mainActions) ?? mainActions}</div>
        <div className='workbench-panel-conversation'>
          {renderSlot?.('main', mainContent, { sizing: 'fill' }) ?? mainContent}
        </div>
      </div>
      <button
        ref={toggleRef}
        type='button'
        className={`workbench-panel-toggle ${expanded ? 'workbench-panel-collapse' : 'workbench-panel-restore'}`}
        onClick={expanded ? collapse : restore}
        disabled={items.length === 0}
        aria-label={expanded ? messages.collapse : messages.open}
        title={expanded ? messages.collapse : messages.open}
        aria-expanded={expanded}
        aria-controls={`${id}-side`}
      >
        <PanelRightIcon aria-hidden='true' />
      </button>
      <div className='workbench-panel-rail' hidden={expanded} />
      <aside id={`${id}-side`} className='workbench-panel-side' hidden={!expanded} aria-label={messages.region}>
        <header className='workbench-panel-header'>
          <div role='tablist' aria-label={messages.tabs} className='workbench-panel-tabs'>
            {visibleItems.map((item, index) => (
              <div
                key={item.id}
                role='presentation'
                className='workbench-panel-tab'
                data-active={active?.id === item.id}
              >
                <button
                  type='button'
                  role='tab'
                  className='workbench-panel-tab-trigger'
                  id={`${id}-tab-${item.id}`}
                  aria-controls={`${id}-content-${item.id}`}
                  aria-selected={active?.id === item.id}
                  tabIndex={active?.id === item.id ? 0 : -1}
                  ref={(element) => {
                    if (element) tabRefs.current.set(item.id, element);
                    else tabRefs.current.delete(item.id);
                  }}
                  onClick={() => select(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Delete') {
                      event.preventDefault();
                      close(item.id);
                      return;
                    }
                    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                    const nextIndex =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? visibleItems.length - 1
                          : offset
                            ? (index + offset + visibleItems.length) % visibleItems.length
                            : -1;
                    const next = visibleItems[nextIndex];
                    if (!next) return;
                    event.preventDefault();
                    select(next.id);
                    tabRefs.current.get(next.id)?.focus();
                  }}
                >
                  <span className='workbench-panel-tab-icon' aria-hidden='true'>
                    {item.icon ?? <FileTextIcon />}
                  </span>
                  <span className='workbench-panel-tab-label'>{item.label}</span>
                </button>
                <button
                  type='button'
                  className='workbench-panel-tab-close'
                  aria-label={messages.closeItem.replace('{name}', item.label)}
                  title={messages.closeItem.replace('{name}', item.label)}
                  tabIndex={active?.id === item.id ? 0 : -1}
                  onClick={() => close(item.id)}
                >
                  <XIcon aria-hidden='true' />
                </button>
              </div>
            ))}
          </div>
        </header>
        {items.map((item) => (
          <div
            key={item.id}
            role='tabpanel'
            className='workbench-panel-content'
            id={`${id}-content-${item.id}`}
            aria-labelledby={`${id}-tab-${item.id}`}
            hidden={!expanded || active?.id !== item.id}
          >
            {item.content}
          </div>
        ))}
      </aside>
    </section>
  );
}
