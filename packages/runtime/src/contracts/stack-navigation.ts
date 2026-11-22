export const STACK_NAVIGATION_SERVICE = 'agent-ui.stack-navigation';
/** Services owned by Runtime, rather than by an enabled Plugin provider. */
export const RUNTIME_PROVIDED_SERVICES: readonly string[] = Object.freeze([STACK_NAVIGATION_SERVICE]);

export interface StackViewState {
  readonly activeViewId: string | null;
  readonly viewIds: readonly string[];
}
export interface StackNavigationSnapshot {
  readonly stacks: Readonly<Record<string, StackViewState>>;
}
export interface StackNavigationService {
  getSnapshot(): StackNavigationSnapshot;
  subscribe(listener: () => void): () => void;
  selectView(stackId: string, viewId: string): void;
}
