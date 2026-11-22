import type { LayoutNode } from '@za38.03/agent-ui-renderer';
import type {
  StackNavigationService,
  StackNavigationSnapshot,
  StackViewState,
} from '../../../contracts/stack-navigation.js';

/** One layout-state owner per Agent. It never changes the authoring model. */
export class StackNavigationRuntime implements StackNavigationService {
  #snapshot: StackNavigationSnapshot = Object.freeze({ stacks: Object.freeze({}) });
  readonly #listeners = new Set<() => void>();
  readonly getSnapshot = (): StackNavigationSnapshot => this.#snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  selectView(stackId: string, viewId: string): void {
    const stack = Object.hasOwn(this.#snapshot.stacks, stackId) ? this.#snapshot.stacks[stackId] : undefined;
    if (!stack) throw new Error('STACK_NAVIGATION_STACK_NOT_FOUND');
    if (!stack.viewIds.includes(viewId)) throw new Error('STACK_NAVIGATION_VIEW_NOT_FOUND');
    if (stack.activeViewId === viewId) return;
    this.#publish({ ...this.#snapshot.stacks, [stackId]: Object.freeze({ ...stack, activeViewId: viewId }) });
  }
  reconcile(root: LayoutNode): void {
    const stacks = new Map<string, StackViewState>();
    const visit = (node: LayoutNode): void => {
      if (node.type === 'stack' && node.viewIds) {
        const { id, viewIds } = node;
        if (stacks.has(id)) throw new Error('STACK_NAVIGATION_DUPLICATE_STACK');
        if (
          viewIds.length !== node.children.length ||
          new Set(viewIds).size !== viewIds.length ||
          viewIds.some((viewId) => !viewId.trim())
        ) {
          throw new Error('STACK_NAVIGATION_VIEWS_INVALID');
        }
        const previous = Object.hasOwn(this.#snapshot.stacks, id) ? this.#snapshot.stacks[id] : undefined;
        const activeNodeId = node.active;
        const index = node.children.findIndex((child) => child.id === activeNodeId);
        const activeViewId =
          previous?.activeViewId && viewIds.includes(previous.activeViewId)
            ? previous.activeViewId
            : (viewIds[Math.max(0, index)] ?? null);
        stacks.set(
          id,
          previous?.activeViewId === activeViewId &&
            previous.viewIds.length === viewIds.length &&
            previous.viewIds.every((value, i) => value === viewIds[i])
            ? previous
            : Object.freeze({ activeViewId, viewIds: Object.freeze([...viewIds]) }),
        );
      }
      if ('children' in node) node.children.forEach(visit);
      else if (node.type === 'panel') visit(node.child);
      else if (node.type === 'sidebar') {
        if (node.header) visit(node.header);
        if (node.footer) visit(node.footer);
        node.items.forEach((item) => visit(item.child));
        visit(node.content);
      }
    };
    visit(root);
    if (
      stacks.size === Object.keys(this.#snapshot.stacks).length &&
      [...stacks].every(([id, state]) => state === this.#snapshot.stacks[id])
    )
      return;
    this.#publish(Object.fromEntries(stacks));
  }
  clear(): void {
    if (Object.keys(this.#snapshot.stacks).length) this.#publish({});
  }
  #publish(stacks: Readonly<Record<string, StackViewState>>): void {
    this.#snapshot = Object.freeze({ stacks: Object.freeze(stacks) });
    for (const listener of this.#listeners) listener();
  }
}
