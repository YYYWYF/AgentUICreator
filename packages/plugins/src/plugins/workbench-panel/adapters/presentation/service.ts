import type { UIPluginObservableService } from '@za38.03/agent-ui-plugins/contracts';

export const WORKBENCH_PANEL_SERVICE = 'agent-ui.workbench-panel';
export const DEFAULT_WORKBENCH_PANEL_IDS = ['notes', 'details'] as const;
export interface WorkbenchPanelSnapshot {
  readonly open: boolean;
  readonly activeItemId: string;
  readonly visibleItemIds: readonly string[];
}
export interface WorkbenchPanelService extends UIPluginObservableService<WorkbenchPanelSnapshot> {
  open(itemId?: string): void;
  activate(itemId: string): void;
  close(itemId: string): void;
  collapse(): void;
}
/** Create once in Plugin setup, separately for each Agent's service scope. */
export function createWorkbenchPanelService(
  itemIds: readonly string[] = DEFAULT_WORKBENCH_PANEL_IDS,
): WorkbenchPanelService {
  const first = itemIds[0];
  if (!first || itemIds.some(id => !id.trim()) || new Set(itemIds).size !== itemIds.length) {
    throw new Error('WORKBENCH_PANEL_ITEMS_INVALID');
  }
  const allowed = new Set(itemIds);
  let snapshot: WorkbenchPanelSnapshot = { open: false, activeItemId: first, visibleItemIds: [...itemIds] };
  const listeners = new Set<() => void>();
  function update(open: boolean, activeItemId: string, visibleItemIds = snapshot.visibleItemIds) {
    if (!allowed.has(activeItemId)) throw new Error('WORKBENCH_PANEL_ITEM_NOT_FOUND');
    if (snapshot.open === open && snapshot.activeItemId === activeItemId && snapshot.visibleItemIds === visibleItemIds) return;
    snapshot = { open, activeItemId, visibleItemIds };
    for (const listener of listeners) listener();
  }
  function show(open: boolean, id: string) {
    update(open, id, snapshot.visibleItemIds.includes(id) ? snapshot.visibleItemIds : [...snapshot.visibleItemIds, id]);
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open: (id = snapshot.activeItemId) => show(true, id),
    activate: id => show(snapshot.open, id),
    close(id) {
      if (!allowed.has(id)) throw new Error('WORKBENCH_PANEL_ITEM_NOT_FOUND');
      const index = snapshot.visibleItemIds.indexOf(id);
      if (index < 0) return;
      const visibleItemIds = snapshot.visibleItemIds.filter(itemId => itemId !== id);
      const activeItemId = snapshot.activeItemId === id
        ? visibleItemIds[Math.min(index, visibleItemIds.length - 1)] ?? id
        : snapshot.activeItemId;
      update(snapshot.open && visibleItemIds.length > 0, activeItemId, visibleItemIds);
    },
    collapse: () => update(false, snapshot.activeItemId),
  };
}
