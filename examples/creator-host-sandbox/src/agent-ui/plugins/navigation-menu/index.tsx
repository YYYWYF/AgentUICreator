import { NavigationMenuPlugin as Implementation } from '@za38.03/agent-ui-plugins/navigation-menu';
import { useLocale, useConversationNavigation, usePluginService, STACK_NAVIGATION_SERVICE, type StackNavigationService } from '@za38.03/agent-ui-plugins';
import { FolderKanbanIcon, BookOpenIcon, WorkflowIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
export function NavigationMenuPlugin(props: ComponentProps<typeof Implementation>) {
  const messages = useLocale('navigationMenu');
  const navigation = useConversationNavigation();
  const service = usePluginService<StackNavigationService>(STACK_NAVIGATION_SERVICE);
  return <Implementation {...props} onNewConversation={props.onNewConversation ?? (async () => {
    await navigation.switchToNewThread();
    const stackId = props.stackId ?? 'main';
    const stacks = service?.getSnapshot().stacks;
    const stack = stacks && Object.hasOwn(stacks, stackId) ? stacks[stackId] : undefined;
    if (stack?.viewIds.includes('chat')) service?.selectView(stackId, 'chat');
  })} items={props.items ?? (defaults => [
    ...defaults,
    { id: 'projects', type: 'view', viewId: 'projects', label: messages.projects, icon: <FolderKanbanIcon /> },
    { id: 'knowledge', type: 'view', viewId: 'knowledge', label: messages.knowledge, icon: <BookOpenIcon /> },
    { id: 'workflows', type: 'view', viewId: 'workflows', label: messages.workflows, icon: <WorkflowIcon /> },
  ])} />;
}
